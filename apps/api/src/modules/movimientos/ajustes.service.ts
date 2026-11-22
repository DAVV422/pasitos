import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import {
  asistentes,
  canjeItems,
  canjes,
  eventos,
  movimientos,
  notasMovimiento,
  outbox,
  premios,
  retos,
  usuarios,
  withOrganizacion,
  type Db,
} from '@pasitos/db';
import { AppError, CATEGORIAS_AJUSTE, type TipoMotivoAjuste } from '@pasitos/dominio';
import { TIPOS_RETO_MANUALES } from '@pasitos/dominio/esquemas';
import type { LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { getNombreCorto } from '../puerta/check-in.service';
import type { AnulacionesService } from './anulaciones.service';

type Pedido = Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>;

export type ResultadoOtorgamiento =
  'ok' | 'ya_completado' | 'tope' | 'sin_check_in' | 'no_encontrado';

/**
 * Corregir puntos, otorgar un reto a mano y anular un canje (HU-317). Todo con
 * `Idempotency-Key`, el autor en el libro y la bitácora.
 */
export class AjustesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly libro: LibroService,
    private readonly anulaciones: AnulacionesService,
    private readonly reloj: Reloj,
  ) {}

  /** `±puntos` con su motivo. Ni más que el tope del evento ni a uno mismo. */
  adjust(
    contexto: ContextoEvento,
    asistenteId: string,
    datos: { puntos: number; motivo: { tipo: TipoMotivoAjuste; texto?: string | undefined } },
    pedido: Pedido,
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(tx, `usuario:${contexto.usuarioId}`, pedido, async () => {
        const [asistente] = await tx
          .select({ id: asistentes.id, nombre: asistentes.nombre, usuarioId: asistentes.usuarioId })
          .from(asistentes)
          .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)));
        if (!asistente) throw new AppError('NO_ENCONTRADO');
        if (asistente.usuarioId === contexto.usuarioId) throw new AppError('AJUSTE_PROPIO');
        const [evento] = await tx
          .select({ tope: eventos.topeAjuste })
          .from(eventos)
          .where(eq(eventos.id, contexto.eventoId));
        const tope = evento?.tope ?? 0;
        if (Math.abs(datos.puntos) > tope) {
          throw new AppError('VALIDACION', {
            errors: [
              {
                field: 'puntos',
                code: 'TOPE',
                message: `El ajuste máximo de este evento es de ${tope} puntos.`,
              },
            ],
          });
        }
        // En el libro (y en el lote público), solo la categoría.
        const categoria = CATEGORIAS_AJUSTE[datos.motivo.tipo];
        const { movimiento, saldo } = await this.libro.addMovimiento(tx, {
          eventoId: contexto.eventoId,
          asistenteId,
          tipo: 'ajuste',
          origen: 'equipo',
          puntos: datos.puntos,
          autorId: contexto.usuarioId,
          motivo: categoria,
        });
        if (datos.motivo.texto) {
          await tx.insert(notasMovimiento).values({
            movimientoId: movimiento.id,
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            texto: datos.motivo.texto,
          });
        }
        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion: 'puntos.ajustar',
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          objeto: { tipo: 'asistente', id: asistente.id, nombre: asistente.nombre },
          despues: {
            puntos: datos.puntos,
            motivo: categoria,
            ...(datos.motivo.texto ? { detalle: datos.motivo.texto } : {}),
          },
        });
        return { movimientoId: movimiento.id, puntos: datos.puntos, saldo };
      }),
    );
  }

  /**
   * Otorgar un reto a varias personas (por código): el resultado **por persona**. Cada una va en
   * su propio punto de guardado, así un tope o un repetido no deshace a las demás.
   */
  grant(
    contexto: ContextoEvento,
    retoId: string,
    datos: { asistentes: readonly string[]; motivo?: string | undefined },
    pedido: Pedido,
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(tx, `usuario:${contexto.usuarioId}`, pedido, async () => {
        const [reto] = await tx
          .select({ id: retos.id, nombre: retos.nombre, tipo: retos.tipo })
          .from(retos)
          .where(and(eq(retos.id, retoId), eq(retos.eventoId, contexto.eventoId)));
        if (!reto) throw new AppError('NO_ENCONTRADO');
        // HU-412: D y C dan por cumplido cualquier reto, menos el del carnet (tiene su flujo). Si no
        // es de tipo `otorgado`, es una excepción: pide el motivo.
        if (!(TIPOS_RETO_MANUALES as readonly string[]).includes(reto.tipo)) {
          throw new AppError('VALIDACION', {
            detail: 'El reto del carnet se cumple en Verificar carnet.',
          });
        }
        if (reto.tipo !== 'otorgado' && (datos.motivo ?? '').trim().length < 5) {
          throw new AppError('VALIDACION', {
            errors: [
              {
                field: 'motivo',
                code: 'REQUERIDO',
                message: 'Cuenta por qué lo das por cumplido (al menos 5 letras).',
              },
            ],
          });
        }
        const [evento] = await tx
          .select({ requiereCheckIn: eventos.retosRequierenCheckIn })
          .from(eventos)
          .where(eq(eventos.id, contexto.eventoId));
        const codigos = [...new Set(datos.asistentes.map((c) => c.toUpperCase()))];
        const filas = await tx
          .select({
            id: asistentes.id,
            codigo: asistentes.codigoAsistente,
            estado: asistentes.estado,
          })
          .from(asistentes)
          .where(
            and(
              eq(asistentes.eventoId, contexto.eventoId),
              inArray(asistentes.codigoAsistente, codigos),
            ),
          );
        const porCodigo = new Map(filas.map((f) => [f.codigo, f]));
        const resultados: { codigo: string; resultado: ResultadoOtorgamiento }[] = [];
        for (const codigo of codigos) {
          const persona = porCodigo.get(codigo);
          if (!persona || persona.estado === 'cancelado') {
            resultados.push({ codigo, resultado: 'no_encontrado' });
            continue;
          }
          if (evento?.requiereCheckIn && persona.estado !== 'presente') {
            resultados.push({ codigo, resultado: 'sin_check_in' });
            continue;
          }
          try {
            await tx.transaction((punto) =>
              this.libro.addMovimiento(punto, {
                eventoId: contexto.eventoId,
                asistenteId: persona.id,
                tipo: 'reto',
                origen: 'equipo',
                retoId: reto.id,
                autorId: contexto.usuarioId,
              }),
            );
            resultados.push({ codigo, resultado: 'ok' });
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            resultados.push({
              codigo,
              resultado:
                error.code === 'RETO_YA_COMPLETADO'
                  ? 'ya_completado'
                  : error.code === 'TOPE_ALCANZADO' || error.code === 'TOPE_PUNTOS_PERSONA'
                    ? 'tope'
                    : 'no_encontrado',
            });
          }
        }
        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion: 'reto.otorgar',
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          objeto: { tipo: 'reto', id: reto.id, nombre: reto.nombre },
          despues: {
            ok: resultados.filter((r) => r.resultado === 'ok').length,
            total: resultados.length,
            ...(datos.motivo ? { motivo: datos.motivo } : {}),
          },
        });
        return { resultados };
      }),
    );
  }

  /**
   * Anular un canje confirmado (HU-317 §1): devuelve los puntos (una `anulacion`), el stock
   * entregado y deja el canje `anulado`. Una sola vez.
   */
  cancelCanje(contexto: ContextoEvento, canjeId: string, motivo: string, pedido: Pedido) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(
        tx,
        `usuario:${contexto.usuarioId}`,
        pedido,
        async () => {
          const [canje] = await tx
            .select({
              id: canjes.id,
              estado: canjes.estado,
              comprobante: canjes.comprobante,
              movimientoId: canjes.movimientoId,
              mesaId: canjes.mesaId,
              asistenteId: canjes.asistenteId,
              totalPuntos: canjes.totalPuntos,
            })
            .from(canjes)
            .where(and(eq(canjes.id, canjeId), eq(canjes.eventoId, contexto.eventoId)))
            .for('update');
          if (!canje) throw new AppError('NO_ENCONTRADO');
          if (canje.estado === 'anulado') throw new AppError('YA_ANULADO');
          if (canje.estado !== 'confirmado') {
            throw new AppError('VALIDACION', { detail: 'Solo se anula un canje confirmado.' });
          }
          const anulacion = canje.movimientoId
            ? await this.anulaciones.cancelMovimiento(tx, {
                movimientoId: canje.movimientoId,
                autorId: contexto.usuarioId,
                motivo,
              })
            : null;
          const items = await tx
            .select({ premioId: canjeItems.premioId, cantidad: canjeItems.cantidad })
            .from(canjeItems)
            .where(eq(canjeItems.canjeId, canje.id))
            .orderBy(asc(canjeItems.premioId));
          for (const item of items) {
            await tx
              .update(premios)
              .set({ stockEntregado: sql`${premios.stockEntregado} - ${item.cantidad}` })
              .where(eq(premios.id, item.premioId));
          }
          await tx
            .update(canjes)
            .set({
              estado: 'anulado',
              anuladoAt: this.reloj.now(),
              anuladoPor: contexto.usuarioId,
              motivoAnulacion: motivo,
              movimientoAnulacionId: anulacion?.movimiento.id ?? null,
            })
            .where(eq(canjes.id, canje.id));
          await tx.insert(outbox).values({
            id: uuidv7(),
            tipo: 'canje.anulado',
            eventoId: contexto.eventoId,
            payload: { eventoId: contexto.eventoId, canjeId: canje.id, mesaId: canje.mesaId },
          });
          await this.bitacora.record(tx, {
            actor: toActor(contexto),
            accion: 'canje.anular',
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            objeto: { tipo: 'canje', id: canje.id, nombre: canje.comprobante },
            despues: { estado: 'anulado', motivo },
          });
          return {
            id: canje.id,
            estado: 'anulado',
            comprobante: canje.comprobante,
            saldo: anulacion?.saldo ?? null,
          };
        },
        200,
      ),
    );
  }

  /** Buscar un canje por comprobante (`C-4821`) o por persona (HU-317 §2, pestaña *Canjes*). */
  searchCanjes(contexto: ContextoEvento, q: string) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const texto = q.trim().toUpperCase();
      const filas = await tx
        .select({
          id: canjes.id,
          comprobante: canjes.comprobante,
          estado: canjes.estado,
          total: canjes.totalPuntos,
          at: canjes.confirmadoAt,
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
        })
        .from(canjes)
        .leftJoin(asistentes, eq(asistentes.id, canjes.asistenteId))
        .where(
          and(
            eq(canjes.eventoId, contexto.eventoId),
            inArray(canjes.estado, ['confirmado', 'anulado']),
            or(eq(canjes.comprobante, texto), eq(asistentes.codigoAsistente, texto)),
          ),
        )
        .orderBy(desc(canjes.createdAt))
        .limit(50);
      return {
        items: filas.map((f) => ({
          ...f,
          at: f.at?.toISOString() ?? null,
          asistente: f.nombre ? { nombre: f.nombre, codigo: f.codigo ?? '' } : null,
        })),
        pagination: { nextCursor: null },
      };
    });
  }

  /** El historial: ajustes, otorgamientos y anulaciones, con autor y motivo. */
  list(
    contexto: ContextoEvento,
    filtros: { tipo?: 'ajuste' | 'otorgado' | 'anulacion' | undefined; autor?: string | undefined },
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const autor = alias(usuarios, 'autor');
      const condiciones: SQL[] = [eq(movimientos.eventoId, contexto.eventoId)];
      const tipos: SQL[] = [];
      if (!filtros.tipo || filtros.tipo === 'ajuste') tipos.push(eq(movimientos.tipo, 'ajuste'));
      if (!filtros.tipo || filtros.tipo === 'anulacion')
        tipos.push(eq(movimientos.tipo, 'anulacion'));
      if (!filtros.tipo || filtros.tipo === 'otorgado') {
        tipos.push(and(eq(movimientos.tipo, 'reto'), eq(movimientos.origen, 'equipo')) as SQL);
      }
      condiciones.push(or(...tipos) as SQL);
      if (filtros.autor) condiciones.push(eq(movimientos.autorId, filtros.autor));
      const filas = await tx
        .select({
          id: movimientos.id,
          tipo: movimientos.tipo,
          puntos: movimientos.puntos,
          motivo: movimientos.motivo,
          hora: movimientos.createdAt,
          reto: retos.nombre,
          nota: notasMovimiento.texto,
          autorId: movimientos.autorId,
          autor: autor.nombre,
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
        })
        .from(movimientos)
        .innerJoin(asistentes, eq(asistentes.id, movimientos.asistenteId))
        .leftJoin(retos, eq(retos.id, movimientos.retoId))
        .leftJoin(notasMovimiento, eq(notasMovimiento.movimientoId, movimientos.id))
        .leftJoin(autor, eq(autor.id, movimientos.autorId))
        .where(and(...condiciones))
        .orderBy(desc(movimientos.id))
        .limit(200);
      return {
        items: filas.map((f) => ({
          id: f.id,
          tipo: f.tipo === 'reto' ? 'otorgado' : f.tipo,
          puntos: f.puntos,
          motivo: f.tipo === 'reto' ? f.reto : f.motivo,
          detalle: f.nota,
          hora: f.hora.toISOString(),
          autor: f.autorId ? { id: f.autorId, nombre: getNombreCorto(f.autor) } : null,
          asistente: { nombre: f.nombre, codigo: f.codigo },
        })),
        pagination: { nextCursor: null },
      };
    });
  }
}
