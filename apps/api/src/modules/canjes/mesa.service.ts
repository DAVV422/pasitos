import { randomBytes, randomInt } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  grupos,
  asistentes,
  canjeItems,
  canjes,
  eventos,
  outbox,
  premios,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { maskCi, AppError } from '@pasitos/dominio';
import { isPocosDisponibles } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import { getUrlArchivo } from '../archivos/archivos.service';
import { hashToken } from '../auth/auth.repository';
import type { Reloj } from '../auth/sesiones.service';
import type { TerminalConectada } from '../terminales/conexion.service';
import { mapGruposDelEvento } from '../grupos/grupos-de';

/** El cobro vale 2 minutos (HU-316 §2). */
export const VIGENCIA_COBRO_MS = 2 * 60 * 1000;

type Pedido = Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>;

export interface CobroGenerado {
  readonly id: string;
  readonly qr: string;
  readonly comprobante: string;
  readonly total: number;
  readonly expiraAt: string;
  readonly items: readonly ItemCobro[];
}

export interface ItemCobro {
  readonly premioId: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly puntos: number;
  /** HU-325: el grupo del premio (*"Souvenir VIP · 0 puntos · VIP ✓"*). */
  readonly grupo: string | null;
}

export interface EstadoCobro {
  readonly id: string;
  readonly estado: 'pendiente' | 'confirmado' | 'vencido' | 'cancelado' | 'anulado';
  readonly comprobante: string;
  readonly total: number;
  readonly expiraAt: string;
  readonly items: readonly ItemCobro[];
  /** Al confirmar: a quién se entrega. */
  readonly asistente: { readonly nombre: string; readonly codigo: string } | null;
  readonly confirmadoAt: string | null;
  readonly requiereCi: boolean;
  /** HU-321: al confirmar un cobro que pide el carnet. */
  readonly carnet: { readonly ci: string | null; readonly verificado: boolean } | null;
}

/** Libera lo reservado de un cobro que no se pagó (vencido o cancelado). */
export async function releaseStock(tx: Tx, canjeId: string): Promise<void> {
  const items = await tx
    .select({ premioId: canjeItems.premioId, cantidad: canjeItems.cantidad })
    .from(canjeItems)
    .where(eq(canjeItems.canjeId, canjeId))
    .orderBy(asc(canjeItems.premioId));
  for (const item of items) {
    await tx
      .update(premios)
      .set({ stockReservado: sql`${premios.stockReservado} - ${item.cantidad}` })
      .where(eq(premios.id, item.premioId));
  }
}

/** Los productos de un cobro, con su nombre. */
export async function listItems(tx: Tx, canjeId: string): Promise<ItemCobro[]> {
  return tx
    .select({
      premioId: canjeItems.premioId,
      nombre: premios.nombre,
      cantidad: canjeItems.cantidad,
      puntos: canjeItems.puntosUnitarios,
      grupo: grupos.nombre,
    })
    .from(canjeItems)
    .innerJoin(premios, eq(premios.id, canjeItems.premioId))
    .leftJoin(grupos, eq(grupos.id, premios.grupoId))
    .where(eq(canjeItems.canjeId, canjeId))
    .orderBy(asc(premios.nombre));
}

function checkMesa(terminal: TerminalConectada): void {
  if (terminal.tipo !== 'mesa') throw new AppError('TERMINAL_DESCONECTADA');
}

/**
 * La mesa de canje (HU-316): el catálogo, el cobro con la reserva de stock (V7), su estado,
 * cancelarlo y el historial del día. La tablet llega con su sesión `px_terminal`.
 */
export class MesaService {
  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly urlPublica: string,
  ) {}

  getCatalogo(terminal: TerminalConectada) {
    checkMesa(terminal);
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const filas = await tx
        .select({
          id: premios.id,
          nombre: premios.nombre,
          descripcion: premios.descripcion,
          imagenArchivoId: premios.imagenArchivoId,
          puntos: premios.puntos,
          total: premios.stockTotal,
          reservado: premios.stockReservado,
          entregado: premios.stockEntregado,
          maxPorPersona: premios.maxPorPersona,
          grupoId: premios.grupoId,
        })
        .from(premios)
        .where(and(eq(premios.eventoId, terminal.evento.id), eq(premios.estado, 'activo')))
        .orderBy(premios.orden, premios.id);
      const delEvento = await mapGruposDelEvento(tx, terminal.evento.id);
      return {
        items: filas.map(({ imagenArchivoId, total, reservado, entregado, grupoId, ...p }) => {
          const disponible = Math.max(0, total - reservado - entregado);
          return {
            ...p,
            imagenUrl: imagenArchivoId ? getUrlArchivo(imagenArchivoId, '400') : null,
            disponible,
            pocos: isPocosDisponibles(disponible, total),
            grupo: grupoId ? (delEvento.get(grupoId)?.nombre ?? null) : null,
          };
        }),
        pagination: { nextCursor: null },
      };
    });
  }

  /**
   * El cobro (HU-316 §2): bloquea los premios **en orden de id** (para no trabarse con otra mesa),
   * comprueba el stock y lo reserva. Dos mesas no pueden reservar la última unidad a la vez.
   */
  createCobro(
    terminal: TerminalConectada,
    items: readonly { premioId: string; cantidad: number }[],
    pedido: Pedido,
  ): Promise<CobroGenerado> {
    checkMesa(terminal);
    return withOrganizacion(this.db, terminal.organizacionId, (tx) =>
      runIdempotente(tx, `mesa:${terminal.id}`, pedido, async () => {
        const [evento] = await tx
          .select({ estado: eventos.estado })
          .from(eventos)
          .where(eq(eventos.id, terminal.evento.id));
        if (evento?.estado !== 'en_curso') {
          throw new AppError('EVENTO_NO_ACTIVO', {
            detail:
              evento?.estado === 'pausado'
                ? 'Pausamos un momento: los canjes vuelven al reanudar.'
                : evento?.estado === 'cerrado'
                  ? 'El evento terminó.'
                  : 'El evento no está en curso.',
          });
        }
        const ordenados = [...items].sort((a, b) => (a.premioId < b.premioId ? -1 : 1));
        const filas = await tx
          .select({
            id: premios.id,
            nombre: premios.nombre,
            puntos: premios.puntos,
            estado: premios.estado,
            total: premios.stockTotal,
            reservado: premios.stockReservado,
            entregado: premios.stockEntregado,
            grupoId: premios.grupoId,
            requiereCi: premios.requiereCi,
          })
          .from(premios)
          .where(
            and(
              eq(premios.eventoId, terminal.evento.id),
              inArray(
                premios.id,
                ordenados.map((i) => i.premioId),
              ),
            ),
          )
          .orderBy(asc(premios.id))
          .for('update');
        const porId = new Map(filas.map((p) => [p.id, p]));
        const delEvento = await mapGruposDelEvento(tx, terminal.evento.id);
        const lineas: ItemCobro[] = [];
        for (const item of ordenados) {
          const premio = porId.get(item.premioId);
          if (!premio || premio.estado !== 'activo') throw new AppError('NO_ENCONTRADO');
          const disponible = premio.total - premio.reservado - premio.entregado;
          if (disponible < item.cantidad) {
            throw new AppError('PREMIO_AGOTADO', {
              detail: `No alcanza el stock de ${premio.nombre}: quedan ${Math.max(0, disponible)}.`,
              meta: {
                premio: {
                  id: premio.id,
                  nombre: premio.nombre,
                  disponible: Math.max(0, disponible),
                },
              },
            });
          }
          lineas.push({
            premioId: premio.id,
            nombre: premio.nombre,
            cantidad: item.cantidad,
            puntos: premio.puntos,
            grupo: premio.grupoId ? (delEvento.get(premio.grupoId)?.nombre ?? null) : null,
          });
        }
        // HU-325: el cobro guarda el grupo de sus premios exclusivos (el primero).
        const grupoId = filas.find((p) => p.grupoId)?.grupoId ?? null;
        for (const linea of lineas) {
          await tx
            .update(premios)
            .set({ stockReservado: sql`${premios.stockReservado} + ${linea.cantidad}` })
            .where(eq(premios.id, linea.premioId));
        }
        const id = uuidv7();
        const token = randomBytes(32).toString('base64url');
        const total = lineas.reduce((suma, l) => suma + l.puntos * l.cantidad, 0);
        const expiraAt = new Date(this.reloj.now().getTime() + VIGENCIA_COBRO_MS);
        const comprobante = await this.newComprobante(tx, terminal.evento.id);
        await tx.insert(canjes).values({
          id,
          organizacionId: terminal.organizacionId,
          eventoId: terminal.evento.id,
          mesaId: terminal.id,
          tokenHash: hashToken(token),
          comprobante,
          totalPuntos: total,
          grupoId,
          requiereCi: filas.some((p) => p.requiereCi),
          expiraAt,
        });
        await tx.insert(canjeItems).values(
          lineas.map((l) => ({
            id: uuidv7(),
            organizacionId: terminal.organizacionId,
            canjeId: id,
            premioId: l.premioId,
            cantidad: l.cantidad,
            puntosUnitarios: l.puntos,
          })),
        );
        return {
          id,
          qr: `${this.urlPublica}/app/cobro/${token}`,
          comprobante,
          total,
          expiraAt: expiraAt.toISOString(),
          items: lineas,
        };
      }),
    );
  }

  getCobro(terminal: TerminalConectada, id: string): Promise<EstadoCobro> {
    checkMesa(terminal);
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const [canje] = await tx
        .select({
          id: canjes.id,
          estado: canjes.estado,
          comprobante: canjes.comprobante,
          total: canjes.totalPuntos,
          expiraAt: canjes.expiraAt,
          confirmadoAt: canjes.confirmadoAt,
          requiereCi: canjes.requiereCi,
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
          ciUltimos: asistentes.ciUltimos,
          ciVerificadoAt: asistentes.ciVerificadoAt,
        })
        .from(canjes)
        .leftJoin(asistentes, eq(asistentes.id, canjes.asistenteId))
        .where(and(eq(canjes.id, id), eq(canjes.mesaId, terminal.id)));
      if (!canje) throw new AppError('NO_ENCONTRADO');
      // Vencido aunque el trabajo todavía no haya pasado (la confirmación también lo comprueba).
      const estado =
        canje.estado === 'pendiente' && canje.expiraAt.getTime() <= this.reloj.now().getTime()
          ? 'vencido'
          : (canje.estado as EstadoCobro['estado']);
      return {
        id: canje.id,
        estado,
        comprobante: canje.comprobante,
        total: canje.total,
        expiraAt: canje.expiraAt.toISOString(),
        items: await listItems(tx, canje.id),
        asistente: canje.nombre ? { nombre: canje.nombre, codigo: canje.codigo ?? '' } : null,
        confirmadoAt: canje.confirmadoAt?.toISOString() ?? null,
        requiereCi: canje.requiereCi,
        // HU-321: *"Pide el carnet: •••567 · verificado ✓"* (o *"sin verificar"*).
        carnet:
          canje.requiereCi && canje.nombre
            ? { ci: maskCi(canje.ciUltimos), verificado: canje.ciVerificadoAt !== null }
            : null,
      };
    });
  }

  /** Cancelar libera el stock. Bloquea el canje y después los premios (el mismo orden que confirmar). */
  cancel(terminal: TerminalConectada, id: string): Promise<{ id: string; estado: string }> {
    checkMesa(terminal);
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const [canje] = await tx
        .select({ estado: canjes.estado })
        .from(canjes)
        .where(and(eq(canjes.id, id), eq(canjes.mesaId, terminal.id)))
        .for('update');
      if (!canje) throw new AppError('NO_ENCONTRADO');
      if (canje.estado === 'confirmado') throw new AppError('CANJE_YA_CONFIRMADO');
      if (canje.estado !== 'pendiente') return { id, estado: canje.estado };
      await releaseStock(tx, id);
      await tx
        .update(canjes)
        .set({ estado: 'cancelado', canceladoAt: this.reloj.now() })
        .where(eq(canjes.id, id));
      return { id, estado: 'cancelado' };
    });
  }

  /** Los canjes de hoy de esta mesa, del más nuevo al más viejo. */
  listHistorial(terminal: TerminalConectada) {
    checkMesa(terminal);
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const desde = new Date(this.reloj.now().getTime() - 24 * 60 * 60 * 1000);
      const filas = await tx
        .select({
          id: canjes.id,
          estado: canjes.estado,
          comprobante: canjes.comprobante,
          total: canjes.totalPuntos,
          at: canjes.createdAt,
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
        })
        .from(canjes)
        .leftJoin(asistentes, eq(asistentes.id, canjes.asistenteId))
        .where(and(eq(canjes.mesaId, terminal.id), gte(canjes.createdAt, desde)))
        .orderBy(desc(canjes.createdAt))
        .limit(200);
      const items = await Promise.all(filas.map((f) => listItems(tx, f.id)));
      return {
        items: filas.map((f, i) => ({
          id: f.id,
          estado: f.estado,
          comprobante: f.comprobante,
          total: f.total,
          at: f.at.toISOString(),
          asistente: f.nombre ? { nombre: f.nombre, codigo: f.codigo ?? '' } : null,
          items: items[i] ?? [],
        })),
        pagination: { nextCursor: null },
      };
    });
  }

  /** *C-4821*: 4 dígitos al azar, únicos en el evento (con reintento; la base es la última defensa). */
  private async newComprobante(tx: Tx, eventoId: string): Promise<string> {
    for (let intento = 0; intento < 30; intento++) {
      const comprobante = `C-${String(randomInt(10_000)).padStart(4, '0')}`;
      const [usado] = await tx
        .select({ id: canjes.id })
        .from(canjes)
        .where(and(eq(canjes.eventoId, eventoId), eq(canjes.comprobante, comprobante)));
      if (!usado) return comprobante;
    }
    throw new AppError('SERVICIO_NO_DISPONIBLE', { detail: 'No hay comprobantes libres.' });
  }
}

/** Para el registro y el aviso en vivo de la mesa. */
export async function notifyCanje(
  tx: Tx,
  tipo: 'canje.confirmado' | 'canje.vencido',
  datos: { eventoId: string; mesaId: string; canjeId: string; comprobante: string },
): Promise<void> {
  await tx.insert(outbox).values({
    id: uuidv7(),
    tipo,
    eventoId: datos.eventoId,
    payload: datos,
  });
}
