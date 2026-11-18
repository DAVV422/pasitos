import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cifrador } from '@pasitos/db';
import { getFranjaRegistro, PERMISO_REGISTRO_MS } from '@pasitos/dominio';

/**
 * Lo que firma el servidor en los QR de registro (HU-319 §3, §4). El secreto de cada QR rotativo
 * no sale del servidor: la tablet o el celular del equipo piden la franja ya firmada.
 */
const LARGO_FIRMA = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `HMAC-SHA256(secreto, qrId ‖ franja)`, recortada a 16 bytes, en base64url. */
export function signFranja(secreto: Buffer, qrId: string, franja: number): string {
  return createHmac('sha256', secreto)
    .update(`${qrId}.${franja}`, 'utf8')
    .digest()
    .subarray(0, LARGO_FIRMA)
    .toString('base64url');
}

export function isFirmaFranja(
  secreto: Buffer,
  qrId: string,
  franja: number,
  firma: string,
): boolean {
  const esperada = Buffer.from(signFranja(secreto, qrId, franja), 'base64url');
  const recibida = Buffer.from(firma, 'base64url');
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** `<qrId>.<franja>.<firma>` de la URL de un rotativo, o `null` si no tiene esa forma. */
export function parseCodigoRotativo(
  codigo: string,
): { qrId: string; franja: number; firma: string } | null {
  const partes = codigo.split('.');
  if (partes.length !== 3) return null;
  const [qrId = '', franjaTexto = '', firma = ''] = partes;
  const franja = Number(franjaTexto);
  if (!UUID.test(qrId) || !/^\d{1,12}$/.test(franjaTexto) || !/^[A-Za-z0-9_-]{22}$/.test(firma)) {
    return null;
  }
  return { qrId, franja, firma };
}

/** El token de un QR fijo: 22 caracteres aleatorios (16 bytes en base64url). */
export function createTokenFijo(): string {
  return randomBytes(16).toString('base64url');
}

export function isTokenFijo(token: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(token);
}

export function buildUrlRotativo(
  publicUrl: string,
  qrId: string,
  secreto: Buffer,
  ahoraMs: number,
): { url: string; franja: number } {
  const franja = getFranjaRegistro(ahoraMs);
  const firma = signFranja(secreto, qrId, franja);
  return { url: `${publicUrl}/app/registro/r/${qrId}.${franja}.${firma}`, franja };
}

export function buildUrlFijo(publicUrl: string, token: string): string {
  return `${publicUrl}/app/registro/f/${token}`;
}

/**
 * El permiso de registro (cookie `px_registro`): `{ qrId, organizacionId, exp }` cifrado y
 * autenticado (AES-256-GCM con la llave de datos). Con él, HU-320 crea la cuenta aunque el QR ya
 * haya cambiado.
 */
export interface PermisoRegistro {
  readonly qrId: string;
  readonly organizacionId: string;
  readonly exp: number;
}

export function buildPermisoRegistro(
  cifrador: Cifrador,
  datos: Omit<PermisoRegistro, 'exp'>,
  ahoraMs: number,
): { valor: string; exp: number } {
  const exp = ahoraMs + PERMISO_REGISTRO_MS;
  const valor = cifrador.encrypt(JSON.stringify({ ...datos, exp })).toString('base64url');
  return { valor, exp };
}

/** El permiso, si es auténtico y no venció; si no, `null`. */
export function readPermisoRegistro(
  cifrador: Cifrador,
  valor: string | undefined,
  ahoraMs: number,
): PermisoRegistro | null {
  if (!valor || valor.length > 512) return null;
  try {
    const datos = JSON.parse(cifrador.decryptTexto(Buffer.from(valor, 'base64url'))) as unknown;
    if (typeof datos !== 'object' || datos === null) return null;
    const { qrId, organizacionId, exp } = datos as Record<string, unknown>;
    if (typeof qrId !== 'string' || typeof organizacionId !== 'string') return null;
    if (typeof exp !== 'number' || exp <= ahoraMs) return null;
    return { qrId, organizacionId, exp };
  } catch {
    return null;
  }
}
