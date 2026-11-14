import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  bitacora,
  eventos,
  lotes,
  movimientosLote,
  outbox,
  pantallas,
  retos,
  type Db,
  type Tx,
} from '@pasitos/db';
import { uuidv7 } from 'uuidv7';

export type FilaLote = typeof lotes.$inferSelect;

/** Un movimiento todavía sin lote, con lo que hace falta para armar su versión pública. */
export interface MovimientoParaLote {
  readonly id: string;
  readonly tipo: string;
  readonly puntos: number;
  readonly idAnonimo: Buffer;
  readonly retoNumero: number | null;
  readonly pantallaNumero: number | null;
  readonly qr: unknown;
  readonly anulaMovimientoId: string | null;
  readonly anulaN: number | null;
  readonly autorId: string | null;
  readonly motivo: string | null;
  readonly createdAt: Date;
}

export interface EventoParaSellar {
  readonly id: string;
  readonly contratoId: string;
  readonly intervaloMin: number;
  readonly ultimoArmadoAt: Date | null;
}

/**
 * Consultas del sellador (rol pasitos_sistema, que salta RLS: Modelo §0.1). Solo Drizzle (Backend §2).
 */
export class SelladorRepository {
  constructor(private readonly db: Db) {}

  transaction<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(trabajo);
  }

  /** Eventos con contrato que están en curso o en pausa, o que todavía tienen movimientos sin lote. */
  async listEventosParaSellar(intervaloPorDefecto: number): Promise<EventoParaSellar[]> {
    const filas = await this.db.execute<{
      id: string;
      contrato_id: string;
      intervalo: number;
      ultimo_armado_at: Date | string | null;
    }>(sql`
      select e.id, e.contrato_id,
             coalesce(e.intervalo_anclaje_min, ${intervaloPorDefecto})::int as intervalo,
             (select max(l.armado_at) from lotes l where l.evento_id = e.id) as ultimo_armado_at
        from eventos e
       where e.contrato_id is not null
         and (e.estado in ('en_curso', 'pausado')
              or exists (select 1 from movimientos m
                          where m.evento_id = e.id
                            and not exists (select 1 from movimientos_lote ml where ml.movimiento_id = m.id)))
       order by e.id`);
    return filas.rows.map((fila) => ({
      id: fila.id,
      contratoId: fila.contrato_id,
      intervaloMin: fila.intervalo,
      ultimoArmadoAt: fila.ultimo_armado_at ? new Date(fila.ultimo_armado_at) : null,
    }));
  }

  async getEvento(eventoId: string) {
    const [fila] = await this.db
      .select({
        id: eventos.id,
        organizacionId: eventos.organizacionId,
        contratoId: eventos.contratoId,
        estado: eventos.estado,
        inicioAt: eventos.inicioAt,
        finAt: eventos.finAt,
        evidenciaSha256: eventos.evidenciaSha256,
        tipo: eventos.tipo,
        enRedHasta: eventos.enRedHasta,
      })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    return fila ?? null;
  }

  async findEventoIdBySlug(slug: string): Promise<string | null> {
    const [fila] = await this.db
      .select({ id: eventos.id })
      .from(eventos)
      .where(eq(eventos.slug, slug));
    return fila?.id ?? null;
  }

  async setContratoId(eventoId: string, contratoId: string): Promise<void> {
    await this.db
      .update(eventos)
      .set({ contratoId, updatedAt: sql`now()` })
      .where(eq(eventos.id, eventoId));
  }

  async setEvidenciaSha256(eventoId: string, sha256: string): Promise<void> {
    await this.db
      .update(eventos)
      .set({ evidenciaSha256: sha256, updatedAt: sql`now()` })
      .where(eq(eventos.id, eventoId));
  }

  async setEnRedHasta(eventoId: string, hasta: Date): Promise<void> {
    await this.db
      .update(eventos)
      .set({ enRedHasta: hasta, updatedAt: sql`now()` })
      .where(eq(eventos.id, eventoId));
  }

  /** Lotes confirmados del evento, en orden (verificación, HU-105 §3). */
  listLotesConfirmados(eventoId: string): Promise<FilaLote[]> {
    return this.db
      .select()
      .from(lotes)
      .where(and(eq(lotes.eventoId, eventoId), eq(lotes.estado, 'confirmado')))
      .orderBy(asc(lotes.numero));
  }

  /** Número de cada lote del evento, por id (evidencia, HU-105 §2). */
  async listNumerosLote(eventoId: string): Promise<Map<string, number>> {
    const filas = await this.db
      .select({ id: lotes.id, numero: lotes.numero })
      .from(lotes)
      .where(eq(lotes.eventoId, eventoId));
    return new Map(filas.map((fila) => [fila.id, fila.numero]));
  }

  /** Números de los retos que están en el contrato. */
  async listNumerosRetosRegistrados(eventoId: string): Promise<number[]> {
    const filas = await this.db
      .select({ numero: retos.numero })
      .from(retos)
      .where(and(eq(retos.eventoId, eventoId), sql`${retos.registradoEnStellarAt} is not null`))
      .orderBy(asc(retos.numero));
    return filas.map((fila) => fila.numero);
  }

  /** Números de las pantallas que están en el contrato. */
  async listNumerosPantallasRegistradas(eventoId: string): Promise<number[]> {
    const filas = await this.db
      .select({ numero: pantallas.numero })
      .from(pantallas)
      .where(
        and(eq(pantallas.eventoId, eventoId), sql`${pantallas.registradaEnStellarAt} is not null`),
      )
      .orderBy(asc(pantallas.numero));
    return filas.map((fila) => fila.numero);
  }

  /** Lotes sin confirmar del evento, en orden. */
  listLotesPendientes(eventoId: string): Promise<FilaLote[]> {
    return this.db
      .select()
      .from(lotes)
      .where(and(eq(lotes.eventoId, eventoId), ne(lotes.estado, 'confirmado')))
      .orderBy(asc(lotes.numero));
  }

  async getLote(eventoId: string, numero: number): Promise<FilaLote | null> {
    const [fila] = await this.db
      .select()
      .from(lotes)
      .where(and(eq(lotes.eventoId, eventoId), eq(lotes.numero, numero)));
    return fila ?? null;
  }

  async updateLote(loteId: string, campos: Partial<typeof lotes.$inferInsert>): Promise<void> {
    await this.db.update(lotes).set(campos).where(eq(lotes.id, loteId));
  }

  /** Lotes sin confirmar con más de `minutos` desde que se armaron (alerta de atraso). */
  async listLotesAtrasados(limite: Date) {
    return this.db
      .select({ eventoId: lotes.eventoId, numero: lotes.numero, estado: lotes.estado })
      .from(lotes)
      .where(
        and(sql`${lotes.estado} in ('armado', 'enviado')`, sql`${lotes.armadoAt} < ${limite}`),
      );
  }

  async countMovimientosSinLote(eventoId: string): Promise<number> {
    const filas = await this.db.execute<{ total: number }>(sql`
      select count(*)::int as total from movimientos m
       where m.evento_id = ${eventoId}
         and not exists (select 1 from movimientos_lote ml where ml.movimiento_id = m.id)`);
    return filas.rows[0]?.total ?? 0;
  }

  // ── Dentro de la transacción que arma el lote ──────────────────────────────

  async lockArmado(tx: Tx, eventoId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lote:${eventoId}`}))`);
  }

  async listMovimientosSinLote(
    tx: Tx,
    eventoId: string,
    hasta: Date,
    maximo: number,
  ): Promise<MovimientoParaLote[]> {
    const filas = await tx.execute<{
      id: string;
      tipo: string;
      puntos: number;
      id_anonimo: Buffer;
      reto_numero: number | null;
      pantalla_numero: number | null;
      qr: unknown;
      anula_movimiento_id: string | null;
      anula_n: number | null;
      autor_id: string | null;
      motivo: string | null;
      created_at: Date | string;
    }>(sql`
      select m.id, m.tipo, m.puntos, a.id_anonimo, r.numero as reto_numero, p.numero as pantalla_numero,
             m.qr, m.anula_movimiento_id, mla.n as anula_n, m.autor_id, m.motivo, m.created_at
        from movimientos m
        join asistentes a on a.id = m.asistente_id
        left join retos r on r.id = m.reto_id
        left join pantallas p on p.id = m.pantalla_id
        left join movimientos_lote mla on mla.movimiento_id = m.anula_movimiento_id
       where m.evento_id = ${eventoId}
         and m.created_at < ${hasta}
         and not exists (select 1 from movimientos_lote ml where ml.movimiento_id = m.id)
       order by m.id
       limit ${maximo}`);
    return filas.rows.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      puntos: f.puntos,
      idAnonimo: f.id_anonimo,
      retoNumero: f.reto_numero,
      pantallaNumero: f.pantalla_numero,
      qr: f.qr,
      anulaMovimientoId: f.anula_movimiento_id,
      anulaN: f.anula_n,
      autorId: f.autor_id,
      motivo: f.motivo,
      createdAt: new Date(f.created_at),
    }));
  }

  async getUltimoN(tx: Tx, eventoId: string): Promise<number> {
    const filas = await tx.execute<{ n: number | null }>(
      sql`select max(n)::int as n from movimientos_lote where evento_id = ${eventoId}`,
    );
    return filas.rows[0]?.n ?? 0;
  }

  async getUltimoLote(
    tx: Tx,
    eventoId: string,
  ): Promise<{ numero: number; huella: Buffer } | null> {
    const [fila] = await tx
      .select({ numero: lotes.numero, huella: lotes.huella })
      .from(lotes)
      .where(eq(lotes.eventoId, eventoId))
      .orderBy(sql`${lotes.numero} desc`)
      .limit(1);
    return fila ?? null;
  }

  /** "equipo #k": orden de aparición de cada autor en el libro del evento. Nunca el nombre. */
  async listAutores(tx: Tx, eventoId: string): Promise<Map<string, number>> {
    const filas = await tx.execute<{ autor_id: string; numero: number }>(sql`
      select autor_id, (row_number() over (order by min(id::text)))::int as numero
        from movimientos where evento_id = ${eventoId} and autor_id is not null
       group by autor_id`);
    return new Map(filas.rows.map((f) => [f.autor_id, f.numero]));
  }

  async insertLote(tx: Tx, fila: typeof lotes.$inferInsert): Promise<FilaLote> {
    const [creado] = await tx.insert(lotes).values(fila).returning();
    if (!creado) {
      throw new Error('La base no devolvió el lote creado');
    }
    return creado;
  }

  async insertMovimientosLote(
    tx: Tx,
    filas: (typeof movimientosLote.$inferInsert)[],
  ): Promise<void> {
    for (let i = 0; i < filas.length; i += 1000) {
      await tx.insert(movimientosLote).values(filas.slice(i, i + 1000));
    }
  }

  /** Los movimientos de un lote, en orden de `n`, para rearmarlo con los mismos (HU-103 §5). */
  async listMovimientosDeLote(
    tx: Tx,
    loteId: string,
  ): Promise<(MovimientoParaLote & { n: number })[]> {
    const filas = await tx.execute<{
      id: string;
      n: number;
      tipo: string;
      puntos: number;
      id_anonimo: Buffer;
      reto_numero: number | null;
      pantalla_numero: number | null;
      qr: unknown;
      anula_movimiento_id: string | null;
      anula_n: number | null;
      autor_id: string | null;
      motivo: string | null;
      created_at: Date | string;
    }>(sql`
      select m.id, ml.n, m.tipo, m.puntos, a.id_anonimo, r.numero as reto_numero, p.numero as pantalla_numero,
             m.qr, m.anula_movimiento_id, mla.n as anula_n, m.autor_id, m.motivo, m.created_at
        from movimientos_lote ml
        join movimientos m on m.id = ml.movimiento_id
        join asistentes a on a.id = m.asistente_id
        left join retos r on r.id = m.reto_id
        left join pantallas p on p.id = m.pantalla_id
        left join movimientos_lote mla on mla.movimiento_id = m.anula_movimiento_id
       where ml.lote_id = ${loteId}
       order by ml.n`);
    return filas.rows.map((f) => ({
      id: f.id,
      n: f.n,
      tipo: f.tipo,
      puntos: f.puntos,
      idAnonimo: f.id_anonimo,
      retoNumero: f.reto_numero,
      pantallaNumero: f.pantalla_numero,
      qr: f.qr,
      anulaMovimientoId: f.anula_movimiento_id,
      anulaN: f.anula_n,
      autorId: f.autor_id,
      motivo: f.motivo,
      createdAt: new Date(f.created_at),
    }));
  }

  async getRangoN(loteId: string): Promise<{ desde: number; hasta: number }> {
    const filas = await this.db.execute<{ desde: number; hasta: number }>(
      sql`select min(n)::int as desde, max(n)::int as hasta from movimientos_lote where lote_id = ${loteId}`,
    );
    return filas.rows[0] ?? { desde: 0, hasta: 0 };
  }

  async insertOutbox(fila: Omit<typeof outbox.$inferInsert, 'id'>): Promise<void> {
    await this.db.insert(outbox).values({ id: uuidv7(), ...fila });
  }

  async insertBitacora(fila: Omit<typeof bitacora.$inferInsert, 'id'>): Promise<void> {
    await this.db.insert(bitacora).values({ id: uuidv7(), ...fila });
  }

  // ── Para los trabajos del contrato ─────────────────────────────────────────

  listRetosActivos(eventoId: string) {
    return this.db
      .select({ id: retos.id, numero: retos.numero, topeTotal: retos.topeTotal })
      .from(retos)
      .where(and(eq(retos.eventoId, eventoId), eq(retos.estado, 'activo')))
      .orderBy(asc(retos.numero));
  }

  async markRetosRegistrados(eventoId: string, numeros: readonly number[]): Promise<void> {
    if (numeros.length === 0) return;
    await this.db
      .update(retos)
      .set({ registradoEnStellarAt: sql`now()` })
      .where(and(eq(retos.eventoId, eventoId), inArray(retos.numero, [...numeros])));
  }

  listPantallasSinRegistrar(eventoId: string) {
    return this.db
      .select({ id: pantallas.id, numero: pantallas.numero, llavePublica: pantallas.llavePublica })
      .from(pantallas)
      .where(
        and(
          eq(pantallas.eventoId, eventoId),
          sql`${pantallas.llavePublica} is not null`,
          sql`${pantallas.registradaEnStellarAt} is null`,
        ),
      )
      .orderBy(asc(pantallas.numero));
  }

  async markPantallaRegistrada(pantallaId: string, registradaAt: Date): Promise<void> {
    await this.db
      .update(pantallas)
      .set({ registradaEnStellarAt: registradaAt })
      .where(eq(pantallas.id, pantallaId));
  }

  /** Totales del cierre (Contrato §2.1), sumados del libro. */
  async getTotales(eventoId: string) {
    const filas = await this.db.execute<{
      ganados: string;
      canjeados: string;
      ajustados: string;
      vencidos: string;
    }>(sql`
      select coalesce(sum(puntos) filter (where tipo in ('checkin', 'reto')), 0)::text as ganados,
             coalesce(-sum(puntos) filter (where tipo = 'canje'), 0)::text as canjeados,
             coalesce(sum(puntos) filter (where tipo in ('ajuste', 'anulacion')), 0)::text as ajustados,
             coalesce(-sum(puntos) filter (where tipo = 'vencimiento'), 0)::text as vencidos
        from movimientos where evento_id = ${eventoId}`);
    const participaciones = await this.db.execute<{ numero: number; total: number }>(sql`
      select r.numero, count(*)::int as total
        from movimientos m join retos r on r.id = m.reto_id
       where m.evento_id = ${eventoId} and m.tipo = 'reto'
       group by r.numero order by r.numero`);
    const fila = filas.rows[0];
    return {
      participaciones: participaciones.rows.map((p) => [p.numero, p.total] as const),
      ganados: BigInt(fila?.ganados ?? 0),
      canjeados: BigInt(fila?.canjeados ?? 0),
      ajustados: BigInt(fila?.ajustados ?? 0),
      vencidos: BigInt(fila?.vencidos ?? 0),
    };
  }
}
