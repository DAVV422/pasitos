import { formatHoraPublica, type MovimientoPublico, type TipoMovimiento } from '@pasitos/dominio';
import { movimientoPublicoSchema } from '@pasitos/dominio/esquemas';
import { buildHoja, buildHuella, buildRaiz, toHex, type Conteo } from '@pasitos/firmas';
import type { MovimientoParaLote } from './sellador.repository';

export interface ContenidoLote {
  readonly publicos: readonly MovimientoPublico[];
  readonly raiz: Uint8Array;
  readonly conteos: readonly Conteo[];
  readonly huella: Uint8Array;
}

interface QrGuardado {
  readonly epoca?: number;
  readonly franja?: number;
  readonly nonce?: string;
  readonly firma?: string;
}

/**
 * Lo que se publica de un movimiento (Contrato §4.1, HU-102 §2). Sin datos personales:
 * el asistente va con su id anónimo y el autor como "equipo #k".
 */
export function toMovimientoPublico(
  movimiento: MovimientoParaLote,
  n: number,
  autores: ReadonlyMap<string, number>,
  nPorMovimiento: ReadonlyMap<string, number>,
): MovimientoPublico {
  const tipo = movimiento.tipo as TipoMovimiento;
  const publico: Record<string, unknown> = {
    n,
    tipo,
    asistente: toHex(movimiento.idAnonimo),
    puntos: movimiento.puntos,
    hora: formatHoraPublica(movimiento.createdAt),
  };
  if (movimiento.retoNumero !== null) publico['reto'] = movimiento.retoNumero;
  if (movimiento.pantallaNumero !== null) publico['pantalla'] = movimiento.pantallaNumero;
  const qr = movimiento.qr as QrGuardado | null;
  if (qr?.firma !== undefined && qr.epoca !== undefined) {
    publico['qr'] =
      qr.nonce !== undefined
        ? { e: qr.epoca, u: qr.nonce, firma: qr.firma }
        : { e: qr.epoca, f: qr.franja ?? 0, firma: qr.firma };
  }
  if (tipo === 'anulacion' && movimiento.anulaMovimientoId) {
    const anula = movimiento.anulaN ?? nPorMovimiento.get(movimiento.anulaMovimientoId);
    if (anula !== undefined) publico['anula'] = anula;
  }
  if ((tipo === 'ajuste' || tipo === 'anulacion') && movimiento.autorId) {
    const numero = autores.get(movimiento.autorId);
    if (numero !== undefined) publico['autor'] = `equipo #${numero}`;
  }
  if (tipo === 'ajuste' && movimiento.motivo) {
    // La fase 3 guarda el motivo como categoría (*Falló el QR*, *Compensación*), sin texto libre.
    publico['motivo'] = movimiento.motivo;
  }
  // El esquema estricto garantiza que no se cuele ningún campo de más.
  return movimientoPublicoSchema.parse(publico);
}

/** Arma los movimientos públicos, la raíz, los conteos por reto y la huella encadenada del lote. */
export async function buildContenidoLote(entrada: {
  readonly eventoIdHash: Uint8Array;
  readonly numero: number;
  readonly huellaAnterior: Uint8Array;
  readonly movimientos: readonly (MovimientoParaLote & { readonly n: number })[];
  readonly autores: ReadonlyMap<string, number>;
}): Promise<ContenidoLote> {
  const nPorMovimiento = new Map(entrada.movimientos.map((m) => [m.id, m.n]));
  const publicos = entrada.movimientos.map((m) =>
    toMovimientoPublico(m, m.n, entrada.autores, nPorMovimiento),
  );
  const hojas = await Promise.all(publicos.map((m) => buildHoja(m)));
  const raiz = await buildRaiz(hojas);

  const porReto = new Map<number, number>();
  for (const m of publicos) {
    if (m.tipo === 'reto' && m.reto !== undefined) {
      porReto.set(m.reto, (porReto.get(m.reto) ?? 0) + 1);
    }
  }
  const conteos = [...porReto.entries()].sort(([a], [b]) => a - b) as Conteo[];

  const huella = await buildHuella({
    eventoIdHash: entrada.eventoIdHash,
    n: entrada.numero,
    huellaAnterior: entrada.huellaAnterior,
    raiz,
    conteos,
  });
  return { publicos, raiz, conteos, huella };
}
