import { buildEventoIdHash, buildGenesis, equalBytes, fromHex, toHex } from '@pasitos/firmas';
import type { StellarPort } from '@pasitos/stellar';
import type { EvidenciaStellar } from '../evidencia/evidencia';
import { buildContenidoLote } from '../sellador/contenido-lote';
import type { SelladorRepository } from '../sellador/sellador.repository';

/** Lo que se compara del contrato, leído de la red o de `evidencia-stellar.json`. */
export interface EstadoVerificable {
  readonly fuente: 'red' | 'evidencia';
  readonly contratoId: string;
  readonly idHash: Uint8Array;
  readonly ultimo: { readonly n: number; readonly huella: Uint8Array };
  readonly retos: ReadonlyMap<number, { readonly tope: number; readonly entregados: number }>;
  readonly cierre: { readonly nFinal: number; readonly huellaFinal: Uint8Array } | null;
}

export interface LoteVerificado {
  readonly numero: number;
  readonly coincide: boolean;
  readonly motivo?: string;
}

export interface ResultadoVerificacion {
  readonly coincide: boolean;
  readonly fuente: EstadoVerificable['fuente'];
  readonly lotes: readonly LoteVerificado[];
  readonly problemas: readonly string[];
}

/** Estado del contrato leído de la red (get_evento, get_ultimo, get_reto, get_cierre). */
export async function readEstadoDeRed(
  stellar: StellarPort,
  contratoId: string,
  numerosRetos: readonly number[],
): Promise<EstadoVerificable> {
  const retos = new Map<number, { tope: number; entregados: number }>();
  for (const numero of numerosRetos) {
    const reto = await stellar.getReto(contratoId, numero);
    if (reto) retos.set(numero, reto);
  }
  const cierre = await stellar.getCierre(contratoId);
  return {
    fuente: 'red',
    contratoId,
    idHash: (await stellar.getEventoContrato(contratoId)).idHash,
    ultimo: await stellar.getUltimo(contratoId),
    retos,
    cierre: cierre ? { nFinal: cierre.nFinal, huellaFinal: cierre.huellaFinal } : null,
  };
}

/** Estado del contrato leído de la evidencia, sin red. */
export function readEstadoDeEvidencia(evidencia: EvidenciaStellar): EstadoVerificable {
  const { estado } = evidencia;
  return {
    fuente: 'evidencia',
    contratoId: evidencia.contrato,
    idHash: fromHex(estado.evento.idHash),
    ultimo: { n: estado.ultimo.n, huella: fromHex(estado.ultimo.huella) },
    retos: new Map(Object.entries(estado.retos).map(([numero, reto]) => [Number(numero), reto])),
    cierre: estado.cierre
      ? { nFinal: estado.cierre.nFinal, huellaFinal: fromHex(estado.cierre.huellaFinal) }
      : null,
  };
}

/**
 * Verificación del Hito A (HU-105 §3): recalcula cada lote desde `movimientos` (no desde lo guardado en
 * `lotes`), arma la cadena de huellas desde la génesis y la compara con el contrato. Solo lee.
 */
export class VerificacionService {
  constructor(private readonly repositorio: SelladorRepository) {}

  async verifyEvento(eventoId: string, estado: EstadoVerificable): Promise<ResultadoVerificacion> {
    const problemas: string[] = [];
    const evento = await this.repositorio.getEvento(eventoId);
    if (!evento) {
      throw new Error(`Evento inexistente: ${eventoId}`);
    }
    if (evento.contratoId !== estado.contratoId) {
      problemas.push(
        `El contrato no es el del evento (${estado.contratoId} en lugar de ${String(evento.contratoId)})`,
      );
    }
    const idHash = await buildEventoIdHash(eventoId);
    if (!equalBytes(idHash, estado.idHash)) {
      problemas.push('El idHash del contrato no es el SHA-256 del id del evento');
    }

    const lotes: LoteVerificado[] = [];
    const entregados = new Map<number, number>();
    let anterior = await buildGenesis(idHash);
    let ultimoN = 0;
    let alterado = false;
    for (const lote of await this.repositorio.listLotesConfirmados(eventoId)) {
      const contenido = await this.repositorio.transaction(async (tx) =>
        buildContenidoLote({
          eventoIdHash: idHash,
          numero: lote.numero,
          huellaAnterior: anterior,
          movimientos: await this.repositorio.listMovimientosDeLote(tx, lote.id),
          autores: await this.repositorio.listAutores(tx, eventoId),
        }),
      );
      for (const [reto, conteo] of contenido.conteos) {
        entregados.set(reto, (entregados.get(reto) ?? 0) + conteo);
      }
      let motivo: string | undefined;
      if (lote.numero !== ultimoN + 1) {
        motivo = `falta el lote ${ultimoN + 1}`;
      } else if (!equalBytes(contenido.raiz, lote.raiz)) {
        motivo = 'los movimientos no dan la raíz anclada: alterado';
      } else if (!equalBytes(contenido.huella, lote.huella)) {
        motivo = alterado
          ? 'sigue a un lote alterado: la cadena ya no coincide'
          : 'la huella no coincide';
      }
      if (motivo) alterado = true;
      lotes.push({ numero: lote.numero, coincide: !motivo, ...(motivo ? { motivo } : {}) });
      anterior = contenido.huella;
      ultimoN = lote.numero;
    }

    if (estado.ultimo.n !== ultimoN) {
      problemas.push(
        `El contrato tiene ${estado.ultimo.n} lotes anclados y la base ${ultimoN} confirmados`,
      );
    }
    if (!equalBytes(estado.ultimo.huella, anterior)) {
      problemas.push(
        `La última huella calculada (${toHex(anterior).slice(0, 16)}…) no es la del contrato (${toHex(estado.ultimo.huella).slice(0, 16)}…)`,
      );
    }
    if (estado.cierre) {
      if (estado.cierre.nFinal !== ultimoN || !equalBytes(estado.cierre.huellaFinal, anterior)) {
        problemas.push('La huella final del cierre no es la calculada');
      }
      const sinLote = await this.repositorio.countMovimientosSinLote(eventoId);
      if (sinLote > 0) {
        problemas.push(`El evento cerró con ${sinLote} movimientos sin anclar`);
      }
    }
    for (const numero of new Set([...estado.retos.keys(), ...entregados.keys()])) {
      const enContrato = estado.retos.get(numero)?.entregados ?? 0;
      const calculado = entregados.get(numero) ?? 0;
      if (enContrato !== calculado) {
        problemas.push(
          `Reto ${numero}: el contrato dice ${enContrato} entregados y los lotes suman ${calculado}`,
        );
      }
    }

    return {
      coincide: problemas.length === 0 && lotes.every((lote) => lote.coincide),
      fuente: estado.fuente,
      lotes,
      problemas,
    };
  }
}

/** El texto que imprime `pnpm stellar:verificar`. */
export function formatVerificacion(resultado: ResultadoVerificacion): string {
  const fuente = resultado.fuente === 'red' ? 'la red' : 'la evidencia';
  if (resultado.coincide) {
    return `Todo coincide: ${resultado.lotes.length} lotes recalculados desde los movimientos, comparados con ${fuente}.\n`;
  }
  const lineas = [`No coincide (comparado con ${fuente}):`];
  for (const lote of resultado.lotes.filter((l) => !l.coincide)) {
    lineas.push(`  Lote ${lote.numero}: ${lote.motivo ?? 'no coincide'}`);
  }
  for (const problema of resultado.problemas) {
    lineas.push(`  ${problema}`);
  }
  return `${lineas.join('\n')}\n`;
}
