import { and, asc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { transaccionesStellar, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';
import {
  OPERACIONES_STELLAR,
  type OperacionStellar,
  type RedStellar,
  type TransaccionFirmada,
} from './tipos';

export type ResultadoFinalTx = 'incluida' | 'fallida' | 'vencida';
export type FilaTransaccionStellar = typeof transaccionesStellar.$inferSelect;

export interface CostoRed {
  readonly transacciones: number;
  readonly comisionStroops: bigint;
  readonly porOperacion: Record<OperacionStellar, { cantidad: number; comisionStroops: bigint }>;
}

export interface FiltroCostoRed {
  readonly eventoId?: string;
  /** `AAAA-MM`, en UTC. */
  readonly mes?: string;
}

/** Inicio y fin (exclusivo) de un mes `AAAA-MM` en UTC. */
export function getRangoMes(mes: string): { desde: Date; hasta: Date } {
  const coincide = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (!coincide) {
    throw new Error(`Mes inválido: "${mes}" (se espera AAAA-MM)`);
  }
  const anio = Number(coincide[1]);
  const numero = Number(coincide[2]);
  return {
    desde: new Date(Date.UTC(anio, numero - 1, 1)),
    hasta: new Date(Date.UTC(anio, numero, 1)),
  };
}

/** `AAAA-MM` de una fecha, en UTC. */
export function formatMes(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
}

/**
 * Registro de las transacciones del operador (HU-104 §1). Una fila por intento enviado; el costo real
 * de un evento es la suma de sus filas. Rol pasitos_sistema (la tabla no tiene RLS).
 */
export class TransaccionesStellarRepository {
  constructor(
    private readonly db: Db,
    private readonly red: RedStellar,
  ) {}

  /** Antes de enviar: si el proceso se corta, el intento igual queda registrado. */
  async insertEnviada(datos: {
    readonly eventoId: string | null;
    readonly loteId?: string | null;
    readonly operacion: OperacionStellar;
    readonly tx: TransaccionFirmada;
  }): Promise<void> {
    await this.db.insert(transaccionesStellar).values({
      id: uuidv7(),
      eventoId: datos.eventoId,
      loteId: datos.loteId ?? null,
      operacion: datos.operacion,
      txHash: datos.tx.hash,
      red: this.red,
      comisionEstimadaStroops: datos.tx.comisionEstimadaStroops,
      recursos: datos.tx.recursos,
    });
  }

  /** Fija el resultado de un intento. Si ya estaba fijado, no hace nada. */
  async resolve(
    txHash: string,
    resultado: ResultadoFinalTx,
    detalle: { readonly comisionStroops?: bigint | null; readonly ledger?: number | null } = {},
  ): Promise<void> {
    await this.db
      .update(transaccionesStellar)
      .set({
        resultado,
        comisionStroops: detalle.comisionStroops ?? null,
        ledgerStellar: detalle.ledger ?? null,
        resueltaAt: sql`now()`,
      })
      .where(
        and(eq(transaccionesStellar.txHash, txHash), eq(transaccionesStellar.resultado, 'enviada')),
      );
  }

  /** Las transacciones que entraron de un evento, en orden (para la evidencia, HU-105 §2). */
  listIncluidas(eventoId: string): Promise<FilaTransaccionStellar[]> {
    return this.db
      .select()
      .from(transaccionesStellar)
      .where(
        and(
          eq(transaccionesStellar.eventoId, eventoId),
          eq(transaccionesStellar.resultado, 'incluida'),
        ),
      )
      .orderBy(asc(transaccionesStellar.ledgerStellar), asc(transaccionesStellar.createdAt));
  }

  /** HU-104 §4: costo por evento, por mes o los dos. Lo cobrado: incluidas y fallidas. */
  async getCostoRed(filtro: FiltroCostoRed = {}): Promise<CostoRed> {
    const condiciones: SQL[] = [];
    if (filtro.eventoId) {
      condiciones.push(eq(transaccionesStellar.eventoId, filtro.eventoId));
    }
    if (filtro.mes) {
      const { desde, hasta } = getRangoMes(filtro.mes);
      condiciones.push(gte(transaccionesStellar.createdAt, desde));
      condiciones.push(lt(transaccionesStellar.createdAt, hasta));
    }
    const filas = await this.db
      .select({
        operacion: transaccionesStellar.operacion,
        cantidad: sql<number>`count(*)::int`,
        comision: sql<string>`coalesce(sum(${transaccionesStellar.comisionStroops}), 0)::text`,
      })
      .from(transaccionesStellar)
      .where(and(...condiciones))
      .groupBy(transaccionesStellar.operacion);

    const porOperacion = Object.fromEntries(
      OPERACIONES_STELLAR.map((operacion) => [operacion, { cantidad: 0, comisionStroops: 0n }]),
    ) as CostoRed['porOperacion'];
    let transacciones = 0;
    let comisionStroops = 0n;
    for (const fila of filas) {
      const comision = BigInt(fila.comision);
      porOperacion[fila.operacion as OperacionStellar] = {
        cantidad: fila.cantidad,
        comisionStroops: comision,
      };
      transacciones += fila.cantidad;
      comisionStroops += comision;
    }
    return { transacciones, comisionStroops, porOperacion };
  }

  /** Lo cobrado desde una fecha, y el promedio de un `anchor` (para los días de saldo, HU-104 §3). */
  async getGastoDesde(desde: Date): Promise<{ total: bigint; promedioAnchor: bigint | null }> {
    const filas = await this.db
      .select({
        total: sql<string>`coalesce(sum(${transaccionesStellar.comisionStroops}), 0)::text`,
        promedioAnchor: sql<
          string | null
        >`(avg(${transaccionesStellar.comisionStroops}) filter (where ${transaccionesStellar.operacion} = 'anchor' and ${transaccionesStellar.resultado} = 'incluida'))::bigint::text`,
      })
      .from(transaccionesStellar)
      .where(gte(transaccionesStellar.createdAt, desde));
    const fila = filas[0];
    return {
      total: BigInt(fila?.total ?? 0),
      promedioAnchor: fila?.promedioAnchor ? BigInt(fila.promedioAnchor) : null,
    };
  }
}
