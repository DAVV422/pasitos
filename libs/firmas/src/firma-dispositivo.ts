import { encodeUtf8, sha256 } from './bytes';

/**
 * La firma del dispositivo del asistente (API §2.1, HU-306 §4). Cada operación que mueve puntos
 * va firmada con la llave del navegador (P-256, no exportable): robar la cookie no alcanza.
 * Funciona igual en el navegador y en Node (WebCrypto).
 *
 * Qué se firma (texto, separado por saltos de línea):
 *
 *   POST
 *   /api/v1/app/reclamos
 *   <Idempotency-Key>
 *   <X-Pasitos-Timestamp>
 *   <SHA-256 del cuerpo en base64url>
 */

export const HEADER_TIMESTAMP = 'X-Pasitos-Timestamp';
export const HEADER_FIRMA = 'X-Pasitos-Firma';
export const HEADER_IDEMPOTENCIA = 'Idempotency-Key';

export interface PedidoFirmado {
  readonly metodo: string;
  /** La ruta sin el dominio ni la consulta: `/api/v1/app/reclamos`. */
  readonly ruta: string;
  readonly clave: string;
  readonly timestamp: number;
  /** El SHA-256 del cuerpo, en base64url (de `hashCuerpo`). */
  readonly hashCuerpo: string;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** El SHA-256 del cuerpo tal como viaja (texto UTF-8; vacío si no hay cuerpo), en base64url. */
export async function hashCuerpo(cuerpo: string | Uint8Array | null | undefined): Promise<string> {
  const bytes = typeof cuerpo === 'string' ? encodeUtf8(cuerpo) : (cuerpo ?? new Uint8Array());
  return toBase64Url(await sha256(bytes));
}

export function buildTextoFirmado(pedido: PedidoFirmado): string {
  return [
    pedido.metodo.toUpperCase(),
    pedido.ruta,
    pedido.clave,
    String(pedido.timestamp),
    pedido.hashCuerpo,
  ].join('\n');
}

const ALGORITMO = { name: 'ECDSA', hash: 'SHA-256' } as const;

/** Firma con la llave privada del navegador. Devuelve la firma (r‖s, 64 bytes) en base64url. */
export async function signPedido(llave: CryptoKey, pedido: PedidoFirmado): Promise<string> {
  const firma = await crypto.subtle.sign(
    ALGORITMO,
    llave,
    encodeUtf8(buildTextoFirmado(pedido)) as BufferSource,
  );
  return toBase64Url(new Uint8Array(firma));
}

/** Importa la llave pública que guarda el servidor (65 bytes sin comprimir). */
export function importLlavePublica(cruda: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    cruda as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/** Verifica la firma de un pedido. Una firma mal formada es simplemente inválida. */
export async function verifyPedido(
  llave: CryptoKey,
  pedido: PedidoFirmado,
  firma: string,
): Promise<boolean> {
  try {
    const bytes = fromBase64Url(firma);
    if (bytes.length !== 64) return false;
    return await crypto.subtle.verify(
      ALGORITMO,
      llave,
      bytes as BufferSource,
      encodeUtf8(buildTextoFirmado(pedido)) as BufferSource,
    );
  } catch {
    return false;
  }
}
