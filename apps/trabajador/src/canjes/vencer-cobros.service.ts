import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { canjeItems, canjes, outbox, premios, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../comun/reloj';

/** Cada cuánto corre `vencer-cobros` (HU-316 §2). */
export const VENCER_COBROS_CADA_MS = 15_000;

/**
 * Trabajo `vencer-cobros` (HU-316 §2): los cobros `pendiente` vencidos pasan a `vencido`, su stock
 * reservado vuelve y la mesa recibe `canje.vencido`. Confirmar comprueba el vencimiento por su
 * cuenta: esto solo libera el stock a tiempo. Bloquea el canje y después los premios, como la mesa.
 */
export class VencerCobrosService {
  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  async expire(limite = 100): Promise<number> {
    const ahora = this.reloj.now();
    return this.db.transaction(async (tx) => {
      const vencidos = await tx
        .select({
          id: canjes.id,
          eventoId: canjes.eventoId,
          mesaId: canjes.mesaId,
          comprobante: canjes.comprobante,
        })
        .from(canjes)
        .where(and(eq(canjes.estado, 'pendiente'), lt(canjes.expiraAt, ahora)))
        .orderBy(asc(canjes.expiraAt))
        .limit(limite)
        .for('update', { skipLocked: true });
      for (const canje of vencidos) {
        const items = await tx
          .select({ premioId: canjeItems.premioId, cantidad: canjeItems.cantidad })
          .from(canjeItems)
          .where(eq(canjeItems.canjeId, canje.id))
          .orderBy(asc(canjeItems.premioId));
        for (const item of items) {
          await tx
            .update(premios)
            .set({ stockReservado: sql`${premios.stockReservado} - ${item.cantidad}` })
            .where(eq(premios.id, item.premioId));
        }
        await tx.update(canjes).set({ estado: 'vencido' }).where(eq(canjes.id, canje.id));
        await tx.insert(outbox).values({
          id: uuidv7(),
          tipo: 'canje.vencido',
          eventoId: canje.eventoId,
          payload: {
            eventoId: canje.eventoId,
            mesaId: canje.mesaId,
            canjeId: canje.id,
            comprobante: canje.comprobante,
          },
        });
      }
      return vencidos.length;
    });
  }
}
