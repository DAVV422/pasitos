import type { MovimientoPublico } from '@pasitos/dominio';
import { concatBytes, encodeU32, encodeUtf8, equalBytes, fromHex, sha256, toHex } from './bytes';
import { canonicalizeJson } from './jcs';

/**
 * Huellas del libro (Contrato y sellador §4, HU-102 §2). El contrato hace el mismo cálculo
 * en Rust (contracts/evento/src/huella.rs) y los dos se prueban con libs/firmas/vectores.
 */

const ETIQUETA_GENESIS = encodeUtf8('PASITOS-GENESIS-v1');
const ETIQUETA_LOTE = encodeUtf8('PASITOS-LOTE-v1');
const PREFIJO_HOJA = Uint8Array.of(0x00);
const PREFIJO_NODO = Uint8Array.of(0x01);

/** Par (número de reto, cantidad de participaciones en el lote). */
export type Conteo = readonly [reto: number, conteo: number];

export interface EntradaHuella {
  readonly eventoIdHash: Uint8Array;
  readonly n: number;
  readonly huellaAnterior: Uint8Array;
  readonly raiz: Uint8Array;
  readonly conteos: readonly Conteo[];
}

export interface PasoPrueba {
  /** De qué lado está el hermano. */
  readonly lado: 'izquierdo' | 'derecho';
  readonly hash: string;
}

/** `SHA-256(utf8(uuid))`, con el uuid en minúsculas y con guiones. */
export function buildEventoIdHash(eventoId: string): Promise<Uint8Array> {
  return sha256(encodeUtf8(eventoId.toLowerCase()));
}

/** `SHA-256(sal ‖ utf8(asistenteId))`. La base lo calcula igual (trigger asignar_id_anonimo). */
export function buildIdAnonimo(sal: Uint8Array, asistenteId: string): Promise<Uint8Array> {
  return sha256(concatBytes(sal, encodeUtf8(asistenteId)));
}

export function buildGenesis(eventoIdHash: Uint8Array): Promise<Uint8Array> {
  assertLargo(eventoIdHash, 'eventoIdHash');
  return sha256(concatBytes(ETIQUETA_GENESIS, eventoIdHash));
}

/** Conteos ordenados por reto, sin repetidos, como los exige el contrato. */
export function encodeConteos(conteos: readonly Conteo[]): Uint8Array {
  let anterior = 0;
  const partes: Uint8Array[] = [];
  for (const [reto, conteo] of conteos) {
    if (reto <= anterior) {
      throw new Error('Los conteos tienen que venir ordenados por reto y sin repetidos');
    }
    anterior = reto;
    partes.push(encodeU32(reto), encodeU32(conteo));
  }
  return concatBytes(...partes);
}

export function buildHuella(entrada: EntradaHuella): Promise<Uint8Array> {
  assertLargo(entrada.eventoIdHash, 'eventoIdHash');
  assertLargo(entrada.huellaAnterior, 'huellaAnterior');
  assertLargo(entrada.raiz, 'raiz');
  return sha256(
    concatBytes(
      ETIQUETA_LOTE,
      entrada.eventoIdHash,
      encodeU32(entrada.n),
      entrada.huellaAnterior,
      entrada.raiz,
      encodeConteos(entrada.conteos),
    ),
  );
}

/** Hoja = `SHA-256(0x00 ‖ JCS(movimiento_publico))`. */
export function buildHoja(movimiento: MovimientoPublico): Promise<Uint8Array> {
  return sha256(concatBytes(PREFIJO_HOJA, encodeUtf8(canonicalizeJson(movimiento))));
}

function buildNodo(izquierdo: Uint8Array, derecho: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(PREFIJO_NODO, izquierdo, derecho));
}

/** Niveles del árbol, de las hojas a la raíz. El último nodo de un nivel impar sube sin duplicarse. */
async function buildNiveles(hojas: readonly Uint8Array[]): Promise<Uint8Array[][]> {
  if (hojas.length === 0) {
    throw new Error('Un lote no puede estar vacío');
  }
  let actual = [...hojas];
  const niveles = [actual];
  while (actual.length > 1) {
    const siguiente: Uint8Array[] = [];
    for (let i = 0; i + 1 < actual.length; i += 2) {
      siguiente.push(await buildNodo(actual[i] as Uint8Array, actual[i + 1] as Uint8Array));
    }
    if (actual.length % 2 === 1) {
      siguiente.push(actual[actual.length - 1] as Uint8Array);
    }
    actual = siguiente;
    niveles.push(actual);
  }
  return niveles;
}

export async function buildRaiz(hojas: readonly Uint8Array[]): Promise<Uint8Array> {
  const niveles = await buildNiveles(hojas);
  return niveles[niveles.length - 1]?.[0] as Uint8Array;
}

/** Hashes hermanos desde la hoja hasta la raíz (Contrato §4.3). */
export async function buildPruebaInclusion(
  hojas: readonly Uint8Array[],
  indice: number,
): Promise<PasoPrueba[]> {
  if (!Number.isInteger(indice) || indice < 0 || indice >= hojas.length) {
    throw new RangeError('Índice fuera del lote');
  }
  const niveles = await buildNiveles(hojas);
  const pasos: PasoPrueba[] = [];
  let posicion = indice;
  for (const nivel of niveles.slice(0, -1)) {
    const hermano = posicion ^ 1;
    const nodo = nivel[hermano];
    if (nodo) {
      pasos.push({ lado: hermano < posicion ? 'izquierdo' : 'derecho', hash: toHex(nodo) });
    }
    posicion = Math.floor(posicion / 2);
  }
  return pasos;
}

export async function verifyPruebaInclusion(
  hoja: Uint8Array,
  prueba: readonly PasoPrueba[],
  raiz: Uint8Array,
): Promise<boolean> {
  let actual = hoja;
  for (const paso of prueba) {
    const hermano = fromHex(paso.hash);
    actual =
      paso.lado === 'izquierdo'
        ? await buildNodo(hermano, actual)
        : await buildNodo(actual, hermano);
  }
  return equalBytes(actual, raiz);
}

function assertLargo(bytes: Uint8Array, nombre: string): void {
  if (bytes.length !== 32) {
    throw new Error(`${nombre} tiene que tener 32 bytes`);
  }
}
