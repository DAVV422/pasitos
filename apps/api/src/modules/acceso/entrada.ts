import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * El QR de *Mi entrada* (HU-311 §1): `PXE1.<asistenteId>.<franja>.<hmac>`.
 * - `franja` = `floor(hora del servidor / 30 s)`;
 * - `hmac` = `HMAC-SHA256(llave de entradas del evento, asistenteId ‖ franja)`, recortado a 16 bytes.
 *
 * **No es un secreto de acceso:** solo sirve para que el equipo encuentre a la persona. Que cambie
 * evita que la captura de otra persona sirva para su check-in. Vale en su franja y la siguiente.
 */
export const PREFIJO_ENTRADA = 'PXE1';
export const FRANJA_ENTRADA_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBytesUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function fromBytesUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getFirma(llave: Buffer, asistente: Buffer, franja: number): Buffer {
  return createHmac('sha256', llave)
    .update(Buffer.concat([asistente, Buffer.from(String(franja), 'utf8')]))
    .digest()
    .subarray(0, 16);
}

/**
 * La firma de la tarjeta impresa (HU-302 §4, D31): sin franja, con su propio texto firmado para
 * que no se confunda con ninguna franja.
 */
function getFirmaFija(llave: Buffer, asistente: Buffer): Buffer {
  return createHmac('sha256', llave)
    .update(Buffer.concat([asistente, Buffer.from('tarjeta', 'utf8')]))
    .digest()
    .subarray(0, 16);
}

/**
 * `PXE1.<asistenteId>.<hmac>`: el QR fijo de la tarjeta impresa, para quien no tiene celular.
 * Sirve para el check-in y para que el equipo otorgue retos a mano; **nunca para vincular**.
 */
export function buildQrEntradaFija(llave: Buffer, asistenteId: string): string {
  const asistente = toBytesUuid(asistenteId);
  return `${PREFIJO_ENTRADA}.${asistente.toString('base64url')}.${getFirmaFija(llave, asistente).toString('base64url')}`;
}

export function getFranjaEntrada(ahoraMs: number): number {
  return Math.floor(ahoraMs / FRANJA_ENTRADA_MS);
}

export interface QrEntrada {
  readonly qr: string;
  /** Hasta cuándo lo acepta la puerta: el fin de la franja siguiente. */
  readonly validoHasta: Date;
}

export function buildQrEntrada(llave: Buffer, asistenteId: string, ahoraMs: number): QrEntrada {
  const franja = getFranjaEntrada(ahoraMs);
  const asistente = toBytesUuid(asistenteId);
  const firma = getFirma(llave, asistente, franja);
  return {
    qr: `${PREFIJO_ENTRADA}.${asistente.toString('base64url')}.${franja}.${firma.toString('base64url')}`,
    validoHasta: new Date((franja + 2) * FRANJA_ENTRADA_MS),
  };
}

export type ResultadoQrEntrada =
  | { readonly valido: true; readonly asistenteId: string; readonly fija: boolean }
  | { readonly valido: false; readonly motivo: 'formato' | 'firma' | 'vencido' };

/** La franja actual o la anterior (entre 30 y 60 s). Lo usa la puerta (HU-301). */
export function verifyQrEntrada(llave: Buffer, qr: string, ahoraMs: number): ResultadoQrEntrada {
  const partes = qr.trim().split('.');
  if (partes.length === 3 && partes[0] === PREFIJO_ENTRADA) {
    return verifyQrEntradaFija(llave, partes[1] ?? '', partes[2] ?? '');
  }
  if (partes.length !== 4 || partes[0] !== PREFIJO_ENTRADA) {
    return { valido: false, motivo: 'formato' };
  }
  const [, asistenteB64 = '', franjaTexto = '', firmaB64 = ''] = partes;
  const asistente = Buffer.from(asistenteB64, 'base64url');
  const firma = Buffer.from(firmaB64, 'base64url');
  const franja = Number(franjaTexto);
  if (
    asistente.length !== 16 ||
    firma.length !== 16 ||
    !/^\d{1,12}$/.test(franjaTexto) ||
    !UUID.test(fromBytesUuid(asistente))
  ) {
    return { valido: false, motivo: 'formato' };
  }
  if (!timingSafeEqual(getFirma(llave, asistente, franja), firma)) {
    return { valido: false, motivo: 'firma' };
  }
  const actual = getFranjaEntrada(ahoraMs);
  if (franja !== actual && franja !== actual - 1) {
    return { valido: false, motivo: 'vencido' };
  }
  return { valido: true, asistenteId: fromBytesUuid(asistente), fija: false };
}

function verifyQrEntradaFija(
  llave: Buffer,
  asistenteB64: string,
  firmaB64: string,
): ResultadoQrEntrada {
  const asistente = Buffer.from(asistenteB64, 'base64url');
  const firma = Buffer.from(firmaB64, 'base64url');
  if (asistente.length !== 16 || firma.length !== 16 || !UUID.test(fromBytesUuid(asistente))) {
    return { valido: false, motivo: 'formato' };
  }
  if (!timingSafeEqual(getFirmaFija(llave, asistente), firma)) {
    return { valido: false, motivo: 'firma' };
  }
  return { valido: true, asistenteId: fromBytesUuid(asistente), fija: true };
}
