import { and, asc, eq, inArray, ne, sql, sum } from 'drizzle-orm';
import {
  canjeItems,
  canjes,
  eventos,
  mesas,
  outbox,
  premios,
  saldos,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { isPocosDisponibles } from '@pasitos/dominio/esquemas';
import type { LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import type { ContextoAsistente, FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import { hashToken } from '../auth/auth.repository';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';
import { listItems, notifyCanje, type ItemCobro } from './mesa.service';

export interface VistaCobro {
  readonly id: string;
  readonly mesa: string;
  readonly items: readonly ItemCobro[];
  readonly total: number;
  readonly saldo: number;
  readonly saldoDespues: number;
  readonly expiraAt: string;
  readonly estado: 'pendiente';
  readonly requiereCi: boolean;
}

export interface CanjeConfirmado {
  readonly comprobante: string;
  readonly items: readonly ItemCobro[];
  readonly total: number;
  readonly saldo: number;
}

const TEXTO_YA_PAGADO = 'Este cobro ya fue pagado.';

/** El cobro, tal como lo ve quien va a pagar: vencido, cancelado o pagado son errores. */
function checkPendiente(canje: { estado: string; expiraAt: Date }, ahora: Date): void {
  if (canje.estado === 'confirmado' || canje.estado === 'anulado') {
    throw new AppError('CANJE_YA_CONFIRMADO', { detail: TEXTO_YA_PAGADO });
  }
  if (canje.estado === 'cancelado') {
    throw new AppError('CANJE_VENCIDO', { meta: { cancelado: true } });
  }
  if (canje.estado !== 'pendiente' || canje.expiraAt.getTime() <= ahora.getTime()) {
    throw new AppError('CANJE_VENCIDO');
  }
}

/**
 * Pagar con puntos el cobro de la mesa (HU-313): la vista previa y la confirmación, firmada e
 * idempotente. Orden de los bloqueos: **saldo → canje → premios**, el mismo que usa la mesa al
 * cancelar (canje → premios), para que no se traben.
 */
export class CobrosAppService {
  /** 10 por minuto por dispositivo. */
  private readonly limite: Limitador;

  constructor(
    private readonly db: Db,
    private readonly libro: LibroService,
    private readonly reloj: Reloj,
  ) {
    this.limite = new Limitador([{ maximo: 10, ms: 60_000 }], () => this.reloj.now().getTime());
  }

  getVista(asistente: ContextoAsistente, token: string): Promise<VistaCobro> {
    return withOrganizacion(this.db, asistente.organizacionId, async (tx) => {
      const canje = await this.findCanje(tx, asistente, token, false);
      checkPendiente(canje, this.reloj.now());
      const [saldo] = await tx
        .select({ puntos: saldos.puntos })
        .from(saldos)
        .where(eq(saldos.asistenteId, asistente.asistenteId));
      const puntos = saldo?.puntos ?? 0;
      return {
        id: canje.id,
        mesa: canje.mesa,
        items: await listItems(tx, canje.id),
        total: canje.total,
        saldo: puntos,
        saldoDespues: puntos - canje.total,
        expiraAt: canje.expiraAt.toISOString(),
        estado: 'pendiente',
        requiereCi: canje.requiereCi,
      };
    });
  }

  async confirm(
    asistente: ContextoAsistente,
    token: string,
    firma: FirmaVerificada,
  ): Promise<CanjeConfirmado> {
    const espera = this.limite.hit(asistente.dispositivoId);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    return withOrganizacion(this.db, asistente.organizacionId, (tx) =>
      runIdempotente(tx, `asistente:${asistente.asistenteId}`, firma, async () => {
        // 2. Saldo, después el canje y después los premios.
        await tx
          .select({ puntos: saldos.puntos })
          .from(saldos)
          .where(eq(saldos.asistenteId, asistente.asistenteId))
          .for('update');
        const canje = await this.findCanje(tx, asistente, token, true);
        const ahora = this.reloj.now();
        // 3. Pendiente y sin vencer (no depende del trabajo que vence los cobros).
        checkPendiente(canje, ahora);
        // 4. Los canjes también se pausan.
        const [evento] = await tx
          .select({ estado: eventos.estado })
          .from(eventos)
          .where(eq(eventos.id, asistente.eventoId));
        if (evento?.estado !== 'en_curso') {
          throw new AppError('EVENTO_NO_ACTIVO', {
            detail:
              evento?.estado === 'pausado'
                ? 'Pausamos un momento. Tus puntos están seguros.'
                : 'El evento no está en curso.',
          });
        }
        const items = await listItems(tx, canje.id);
        const premiosIds = items.map((i) => i.premioId).sort();
        const filas = await tx
          .select({
            id: premios.id,
            nombre: premios.nombre,
            maxPorPersona: premios.maxPorPersona,
            total: premios.stockTotal,
            reservado: premios.stockReservado,
            entregado: premios.stockEntregado,
          })
          .from(premios)
          .where(inArray(premios.id, premiosIds))
          .orderBy(asc(premios.id))
          .for('update');

        // 5. El máximo por persona: lo ya canjeado (sin anular) más lo de este cobro.
        for (const premio of filas) {
          if (premio.maxPorPersona === null) continue;
          const item = items.find((i) => i.premioId === premio.id);
          const [previos] = await tx
            .select({ cantidad: sum(canjeItems.cantidad) })
            .from(canjeItems)
            .innerJoin(canjes, eq(canjes.id, canjeItems.canjeId))
            .where(
              and(
                eq(canjes.asistenteId, asistente.asistenteId),
                eq(canjes.estado, 'confirmado'),
                eq(canjeItems.premioId, premio.id),
                ne(canjes.id, canje.id),
              ),
            );
          const ya = Number(previos?.cantidad ?? 0);
          if (ya + (item?.cantidad ?? 0) > premio.maxPorPersona) {
            throw new AppError('MAXIMO_POR_PERSONA', {
              detail: `Puedes canjear ${premio.maxPorPersona} ${premio.nombre.toLowerCase()} por persona.`,
              meta: {
                premio: { id: premio.id, nombre: premio.nombre },
                maximo: premio.maxPorPersona,
              },
            });
          }
        }

        // 7. El libro: el saldo no puede quedar negativo (`SALDO_INSUFICIENTE`).
        const movimiento =
          canje.total > 0
            ? await this.libro.addMovimiento(tx, {
                eventoId: asistente.eventoId,
                asistenteId: asistente.asistenteId,
                tipo: 'canje',
                origen: 'asistente',
                puntos: -canje.total,
                canjeId: canje.id,
                firmaDispositivo: firma.firma,
              })
            : null;
        // 8. Lo reservado pasa a entregado.
        for (const item of items) {
          await tx
            .update(premios)
            .set({
              stockReservado: sql`${premios.stockReservado} - ${item.cantidad}`,
              stockEntregado: sql`${premios.stockEntregado} + ${item.cantidad}`,
            })
            .where(eq(premios.id, item.premioId));
        }
        // 9. El canje confirmado.
        await tx
          .update(canjes)
          .set({
            estado: 'confirmado',
            asistenteId: asistente.asistenteId,
            confirmadoAt: ahora,
            movimientoId: movimiento?.movimiento.id ?? null,
          })
          .where(eq(canjes.id, canje.id));
        // 10. La mesa lo ve al instante; y el aviso de stock bajo.
        await notifyCanje(tx, 'canje.confirmado', {
          eventoId: asistente.eventoId,
          mesaId: canje.mesaId,
          canjeId: canje.id,
          comprobante: canje.comprobante,
        });
        for (const premio of filas) {
          // Reservado pasa a entregado: lo disponible no cambia al confirmar.
          const disponible = premio.total - premio.reservado - premio.entregado;
          if (isPocosDisponibles(disponible, premio.total)) {
            await tx.insert(outbox).values({
              id: uuidv7(),
              tipo: 'stock.bajo',
              eventoId: asistente.eventoId,
              payload: {
                eventoId: asistente.eventoId,
                premioId: premio.id,
                nombre: premio.nombre,
                disponible: Math.max(0, disponible),
              },
            });
          }
        }
        const [saldo] = await tx
          .select({ puntos: saldos.puntos })
          .from(saldos)
          .where(eq(saldos.asistenteId, asistente.asistenteId));
        return {
          comprobante: canje.comprobante,
          items,
          total: canje.total,
          saldo: movimiento?.saldo ?? saldo?.puntos ?? 0,
        };
      }),
    );
  }

  /** El cobro por el hash del token, solo del evento de la persona. */
  private async findCanje(tx: Tx, asistente: ContextoAsistente, token: string, bloquear: boolean) {
    const consulta = tx
      .select({
        id: canjes.id,
        estado: canjes.estado,
        comprobante: canjes.comprobante,
        total: canjes.totalPuntos,
        expiraAt: canjes.expiraAt,
        mesaId: canjes.mesaId,
        requiereCi: canjes.requiereCi,
      })
      .from(canjes)
      .where(and(eq(canjes.tokenHash, hashToken(token)), eq(canjes.eventoId, asistente.eventoId)));
    const [canje] = bloquear ? await consulta.for('update') : await consulta;
    // Un token inventado responde igual que uno vencido.
    if (!canje) throw new AppError('CANJE_VENCIDO');
    const [mesa] = await tx
      .select({ nombre: mesas.nombre })
      .from(mesas)
      .where(eq(mesas.id, canje.mesaId));
    return { ...canje, mesa: mesa?.nombre ?? 'La mesa' };
  }
}
