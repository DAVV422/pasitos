import { and, desc, eq, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  asistentes,
  eventos,
  lotes,
  movimientos,
  movimientosLote,
  retos,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { buildQrEntrada } from './entrada';
import { getDetalleMovimiento } from './estado-app';
import { listGruposDe } from '../grupos/grupos-de';

const POR_PAGINA = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un movimiento en el historial del asistente (HU-311 §2). */
export interface MovimientoHistorial {
  readonly id: string;
  readonly tipo: string;
  readonly puntos: number;
  readonly detalle: string;
  readonly hora: string;
  /** `registrado_en_stellar` cuando su lote está confirmado. */
  readonly estado: 'confirmado' | 'registrado_en_stellar';
  /** El enlace a la transacción en stellar.expert (solo en testnet). */
  readonly enlaceStellar: string | null;
  /** En una anulación: el movimiento que anula. */
  readonly anulaMovimientoId: string | null;
}

export interface PaginaHistorial {
  readonly items: readonly MovimientoHistorial[];
  readonly pagination: { readonly limit: number; readonly nextCursor: string | null };
}

/**
 * `GET /app/movimientos?cursor=` de 50 en 50, del más nuevo al más viejo. El cursor es el id del
 * último de la página (UUID v7, ordenado). El motivo interno de un ajuste nunca se muestra.
 */
export async function listMovimientosApp(
  tx: Tx,
  asistenteId: string,
  cursor: string | undefined,
  red: 'local' | 'testnet',
): Promise<PaginaHistorial> {
  if (cursor !== undefined && !UUID.test(cursor)) {
    throw new AppError('VALIDACION', {
      errors: [{ field: 'cursor', code: 'NO_VALIDO', message: 'El cursor no es válido.' }],
    });
  }
  const anulado = alias(movimientos, 'anulado');
  const retoAnulado = alias(retos, 'reto_anulado');
  const filas = await tx
    .select({
      id: movimientos.id,
      tipo: movimientos.tipo,
      puntos: movimientos.puntos,
      reto: retos.nombre,
      hora: movimientos.createdAt,
      anulaMovimientoId: movimientos.anulaMovimientoId,
      anuladoTipo: anulado.tipo,
      anuladoReto: retoAnulado.nombre,
      loteEstado: lotes.estado,
      txHash: lotes.txHash,
    })
    .from(movimientos)
    .leftJoin(retos, eq(retos.id, movimientos.retoId))
    .leftJoin(anulado, eq(anulado.id, movimientos.anulaMovimientoId))
    .leftJoin(retoAnulado, eq(retoAnulado.id, anulado.retoId))
    .leftJoin(movimientosLote, eq(movimientosLote.movimientoId, movimientos.id))
    .leftJoin(lotes, eq(lotes.id, movimientosLote.loteId))
    .where(
      cursor
        ? and(eq(movimientos.asistenteId, asistenteId), lt(movimientos.id, cursor))
        : eq(movimientos.asistenteId, asistenteId),
    )
    .orderBy(desc(movimientos.id))
    .limit(POR_PAGINA + 1);

  const pagina = filas.slice(0, POR_PAGINA);
  return {
    items: pagina.map((fila) => {
      const enStellar = fila.loteEstado === 'confirmado';
      const detalle =
        fila.tipo === 'anulacion' && fila.anuladoTipo
          ? `Anulado: ${getDetalleMovimiento(fila.anuladoTipo, fila.anuladoReto)}`
          : getDetalleMovimiento(fila.tipo, fila.reto);
      return {
        id: fila.id,
        tipo: fila.tipo,
        puntos: fila.puntos,
        detalle,
        hora: fila.hora.toISOString(),
        estado: enStellar ? 'registrado_en_stellar' : 'confirmado',
        enlaceStellar:
          enStellar && fila.txHash && red === 'testnet'
            ? `https://stellar.expert/explorer/testnet/tx/${fila.txHash}`
            : null,
        anulaMovimientoId: fila.anulaMovimientoId,
      };
    }),
    pagination: {
      limit: POR_PAGINA,
      nextCursor: filas.length > POR_PAGINA ? (pagina.at(-1)?.id ?? null) : null,
    },
  };
}

/** `GET /app/mi-entrada` (HU-311 §1). */
export interface MiEntrada {
  readonly qr: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly validoHasta: string;
  /** HU-325. */
  readonly grupos: readonly string[];
  /** HU-321. */
  readonly ci: { readonly cargado: boolean; readonly verificado: boolean };
}

export async function getMiEntrada(tx: Tx, asistenteId: string, ahora: Date): Promise<MiEntrada> {
  const [fila] = await tx
    .select({
      codigo: asistentes.codigoAsistente,
      nombre: asistentes.nombre,
      llave: eventos.llaveEntradas,
    })
    .from(asistentes)
    .innerJoin(eventos, eq(eventos.id, asistentes.eventoId))
    .where(eq(asistentes.id, asistenteId));
  if (!fila) {
    throw new AppError('NO_ENCONTRADO');
  }
  const { qr, validoHasta } = buildQrEntrada(fila.llave, asistenteId, ahora.getTime());
  return {
    qr,
    codigo: fila.codigo,
    nombre: fila.nombre,
    validoHasta: validoHasta.toISOString(),
    grupos: (await listGruposDe(tx, asistenteId)).map((g) => g.nombre),
    ci: { cargado: false, verificado: false },
  };
}
