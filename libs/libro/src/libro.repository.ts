import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { eventos, movimientos, outbox, participaciones, retos, saldos, type Tx } from '@pasitos/db';
import { TIPOS_GANANCIA } from '@pasitos/dominio';

export type FilaMovimiento = typeof movimientos.$inferSelect;
export type NuevaFilaMovimiento = typeof movimientos.$inferInsert;

/** Consultas del libro con Drizzle, nada más (Backend §2). Siempre dentro de la transacción de quien llama. */
export class LibroRepository {
  /** Bloquea el saldo del asistente: toda operación que mueve puntos empieza aquí (Modelo §12). */
  async lockSaldo(tx: Tx, asistenteId: string) {
    const [fila] = await tx
      .select({
        puntos: saldos.puntos,
        eventoId: saldos.eventoId,
        organizacionId: saldos.organizacionId,
      })
      .from(saldos)
      .where(eq(saldos.asistenteId, asistenteId))
      .for('update');
    return fila ?? null;
  }

  async lockReto(tx: Tx, retoId: string) {
    const [fila] = await tx
      .select({
        eventoId: retos.eventoId,
        puntos: retos.puntos,
        topeTotal: retos.topeTotal,
        entregados: retos.entregados,
        vecesPorPersona: retos.vecesPorPersona,
        estado: retos.estado,
      })
      .from(retos)
      .where(eq(retos.id, retoId))
      .for('update');
    return fila ?? null;
  }

  async countParticipaciones(tx: Tx, retoId: string, asistenteId: string): Promise<number> {
    const [fila] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(participaciones)
      .where(and(eq(participaciones.retoId, retoId), eq(participaciones.asistenteId, asistenteId)));
    return fila?.total ?? 0;
  }

  async getTopePuntosPersona(tx: Tx, eventoId: string): Promise<number | null> {
    const [fila] = await tx
      .select({ tope: eventos.topePuntosPersona })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    return fila?.tope ?? null;
  }

  /** Lo ganado con retos y check-in (para el tope por persona). */
  async sumGanados(tx: Tx, asistenteId: string): Promise<number> {
    const [fila] = await tx
      .select({ total: sql<number>`coalesce(sum(${movimientos.puntos}), 0)::int` })
      .from(movimientos)
      .where(
        and(
          eq(movimientos.asistenteId, asistenteId),
          inArray(movimientos.tipo, [...TIPOS_GANANCIA]),
        ),
      );
    return fila?.total ?? 0;
  }

  async sumMovimientos(tx: Tx, asistenteId: string): Promise<number> {
    const [fila] = await tx
      .select({ total: sql<number>`coalesce(sum(${movimientos.puntos}), 0)::int` })
      .from(movimientos)
      .where(eq(movimientos.asistenteId, asistenteId));
    return fila?.total ?? 0;
  }

  async insertMovimiento(tx: Tx, fila: NuevaFilaMovimiento): Promise<FilaMovimiento> {
    const [creado] = await tx.insert(movimientos).values(fila).returning();
    if (!creado) {
      throw new Error('La base no devolvió el movimiento creado');
    }
    return creado;
  }

  async insertParticipacion(tx: Tx, fila: typeof participaciones.$inferInsert): Promise<void> {
    await tx.insert(participaciones).values(fila);
  }

  async incrementEntregados(tx: Tx, retoId: string): Promise<void> {
    await tx
      .update(retos)
      .set({ entregados: sql`${retos.entregados} + 1`, updatedAt: sql`now()` })
      .where(eq(retos.id, retoId));
  }

  async addSaldo(tx: Tx, asistenteId: string, puntos: number): Promise<number> {
    const [fila] = await tx
      .update(saldos)
      .set({ puntos: sql`${saldos.puntos} + ${puntos}`, updatedAt: sql`now()` })
      .where(eq(saldos.asistenteId, asistenteId))
      .returning({ puntos: saldos.puntos });
    if (!fila) {
      throw new Error('No existe el saldo del asistente');
    }
    return fila.puntos;
  }

  async getSaldo(tx: Tx, asistenteId: string): Promise<number | null> {
    const [fila] = await tx
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, asistenteId));
    return fila?.puntos ?? null;
  }

  async insertOutbox(tx: Tx, fila: typeof outbox.$inferInsert): Promise<void> {
    await tx.insert(outbox).values(fila);
  }

  /** Historial del más nuevo al más viejo, paginado por cursor (el id del último de la página anterior). */
  async listMovimientos(tx: Tx, asistenteId: string, limite: number, cursor?: string) {
    return tx
      .select()
      .from(movimientos)
      .where(
        cursor
          ? and(eq(movimientos.asistenteId, asistenteId), lt(movimientos.id, cursor))
          : eq(movimientos.asistenteId, asistenteId),
      )
      .orderBy(desc(movimientos.id))
      .limit(limite);
  }
}
