import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, sql, sum } from 'drizzle-orm';
import {
  asistentes,
  canjeItems,
  canjes,
  notasMovimiento,
  outbox,
  premios,
  saldos,
  withOrganizacion,
  type Db,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { isPocosDisponibles, type DatosCanjeManual } from '@pasitos/dominio/esquemas';
import type { LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { runIdempotente } from '../acceso/idempotencia';
import { hashToken } from '../auth/auth.repository';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { createComprobante } from '../canjes/mesa.service';
import { listGruposDe, mapGruposDelEvento } from '../grupos/grupos-de';

type Pedido = Parameters<typeof runIdempotente>[2];

/** En el libro y en el lote público va solo esto; el motivo escrito queda para el equipo. */
const CATEGORIA_CANJE_MANUAL = 'Canje manual';

export interface CanjeManualHecho {
  readonly id: string;
  readonly comprobante: string;
  readonly items: readonly { premioId: string; nombre: string; cantidad: number; puntos: number }[];
  readonly total: number;
  readonly saldo: number;
}

/**
 * Canjear un premio a mano desde el panel (HU-412), para cuando la persona no puede confirmar con
 * su celular. Las mismas reglas que en la mesa (stock, grupo, máximo por persona y saldo), sin la
 * firma del celular: queda un canje **confirmado** con su comprobante, el autor y el motivo.
 */
export class CanjesManualesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly libro: LibroService,
    private readonly reloj: Reloj,
  ) {}

  create(
    contexto: ContextoEvento,
    datos: DatosCanjeManual,
    pedido: Pedido,
  ): Promise<CanjeManualHecho> {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(tx, `usuario:${contexto.usuarioId}`, pedido, async () => {
        // 1. La persona, de este evento y no cancelada; su saldo bloqueado.
        const [persona] = await tx
          .select({ id: asistentes.id, nombre: asistentes.nombre, estado: asistentes.estado })
          .from(asistentes)
          .where(
            and(eq(asistentes.id, datos.asistenteId), eq(asistentes.eventoId, contexto.eventoId)),
          );
        if (!persona || persona.estado === 'cancelado') throw new AppError('NO_ENCONTRADO');
        await tx
          .select({ puntos: saldos.puntos })
          .from(saldos)
          .where(eq(saldos.asistenteId, persona.id))
          .for('update');

        // 2. Los premios, bloqueados en orden; activos y con stock.
        const cantidades = new Map<string, number>();
        for (const item of datos.items) {
          cantidades.set(item.premioId, (cantidades.get(item.premioId) ?? 0) + item.cantidad);
        }
        const ids = [...cantidades.keys()].sort();
        const filas = await tx
          .select({
            id: premios.id,
            nombre: premios.nombre,
            puntos: premios.puntos,
            estado: premios.estado,
            total: premios.stockTotal,
            reservado: premios.stockReservado,
            entregado: premios.stockEntregado,
            maxPorPersona: premios.maxPorPersona,
            grupoId: premios.grupoId,
          })
          .from(premios)
          .where(and(eq(premios.eventoId, contexto.eventoId), inArray(premios.id, ids)))
          .orderBy(asc(premios.id))
          .for('update');
        if (filas.length !== ids.length) throw new AppError('NO_ENCONTRADO');
        const grupos = await mapGruposDelEvento(tx, contexto.eventoId);
        const mios = new Set((await listGruposDe(tx, persona.id)).map((g) => g.id));
        for (const premio of filas) {
          const cantidad = cantidades.get(premio.id) ?? 0;
          if (premio.estado !== 'activo') throw new AppError('NO_ENCONTRADO');
          const disponible = premio.total - premio.reservado - premio.entregado;
          if (disponible < cantidad) {
            throw new AppError('PREMIO_AGOTADO', {
              detail: `No alcanza el stock de ${premio.nombre}: quedan ${Math.max(0, disponible)}.`,
              meta: { premio: { id: premio.id, nombre: premio.nombre, disponible } },
            });
          }
          // HU-325: un premio de un grupo, solo para las personas del grupo.
          if (premio.grupoId && !mios.has(premio.grupoId)) {
            const grupo = grupos.get(premio.grupoId)?.nombre ?? 'un grupo';
            throw new AppError('SOLO_PARA_GRUPO', {
              detail: `${premio.nombre} es solo para ${grupo}.`,
              meta: { premio: { id: premio.id, nombre: premio.nombre }, grupo },
            });
          }
          if (premio.maxPorPersona !== null) {
            const [previos] = await tx
              .select({ cantidad: sum(canjeItems.cantidad) })
              .from(canjeItems)
              .innerJoin(canjes, eq(canjes.id, canjeItems.canjeId))
              .where(
                and(
                  eq(canjes.asistenteId, persona.id),
                  eq(canjes.estado, 'confirmado'),
                  eq(canjeItems.premioId, premio.id),
                ),
              );
            if (Number(previos?.cantidad ?? 0) + cantidad > premio.maxPorPersona) {
              throw new AppError('MAXIMO_POR_PERSONA', {
                detail: `${premio.nombre}: ${premio.maxPorPersona} por persona.`,
                meta: {
                  premio: { id: premio.id, nombre: premio.nombre },
                  maximo: premio.maxPorPersona,
                },
              });
            }
          }
        }

        // 3. El canje, ya confirmado y sin mesa. El token no se usa: solo cumple la columna.
        const ahora = this.reloj.now();
        const id = uuidv7();
        const items = filas.map((p) => ({
          premioId: p.id,
          nombre: p.nombre,
          cantidad: cantidades.get(p.id) ?? 0,
          puntos: p.puntos,
        }));
        const total = items.reduce((suma, i) => suma + i.puntos * i.cantidad, 0);
        const comprobante = await createComprobante(tx, contexto.eventoId);
        await tx.insert(canjes).values({
          id,
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          mesaId: null,
          registradoPor: contexto.usuarioId,
          asistenteId: persona.id,
          tokenHash: hashToken(randomBytes(32).toString('base64url')),
          comprobante,
          totalPuntos: total,
          estado: 'pendiente',
          grupoId: filas.find((p) => p.grupoId)?.grupoId ?? null,
          expiraAt: ahora,
        });
        await tx.insert(canjeItems).values(
          items.map((i) => ({
            id: uuidv7(),
            organizacionId: contexto.organizacionId,
            canjeId: id,
            premioId: i.premioId,
            cantidad: i.cantidad,
            puntosUnitarios: i.puntos,
          })),
        );

        // 4. El libro (sin saldo suficiente: `SALDO_INSUFICIENTE`), el stock y el canje confirmado.
        const movimiento = await this.libro.addMovimiento(tx, {
          eventoId: contexto.eventoId,
          asistenteId: persona.id,
          tipo: 'canje',
          origen: 'equipo',
          puntos: total === 0 ? 0 : -total,
          canjeId: id,
          autorId: contexto.usuarioId,
          motivo: CATEGORIA_CANJE_MANUAL,
        });
        if (movimiento) {
          await tx.insert(notasMovimiento).values({
            movimientoId: movimiento.movimiento.id,
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            texto: datos.motivo,
          });
        }
        for (const item of items) {
          await tx
            .update(premios)
            .set({ stockEntregado: sql`${premios.stockEntregado} + ${item.cantidad}` })
            .where(eq(premios.id, item.premioId));
        }
        await tx
          .update(canjes)
          .set({
            estado: 'confirmado',
            confirmadoAt: ahora,
            movimientoId: movimiento?.movimiento.id ?? null,
          })
          .where(eq(canjes.id, id));
        for (const premio of filas) {
          const disponible =
            premio.total - premio.reservado - premio.entregado - (cantidades.get(premio.id) ?? 0);
          if (isPocosDisponibles(disponible, premio.total)) {
            await tx.insert(outbox).values({
              id: uuidv7(),
              tipo: 'stock.bajo',
              eventoId: contexto.eventoId,
              payload: {
                eventoId: contexto.eventoId,
                premioId: premio.id,
                nombre: premio.nombre,
                disponible: Math.max(0, disponible),
              },
            });
          }
        }

        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion: 'canje.manual',
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          objeto: { tipo: 'canje', id, nombre: comprobante },
          despues: {
            asistente: persona.nombre,
            items: items.map((i) => `${i.cantidad} × ${i.nombre}`),
            total,
            motivo: datos.motivo,
          },
        });
        const [saldo] = await tx
          .select({ puntos: saldos.puntos })
          .from(saldos)
          .where(eq(saldos.asistenteId, persona.id));
        return { id, comprobante, items, total, saldo: movimiento?.saldo ?? saldo?.puntos ?? 0 };
      }),
    );
  }
}
