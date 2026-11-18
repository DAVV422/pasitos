import { encodeUtf8 } from './bytes';
import { fromBase64Url, toBase64Url } from './firma-dispositivo';
import { canonicalizeJson } from './jcs';

/**
 * El QR de reto que firma la pantalla (HU-314 §3, Contrato y sellador §4.1):
 * `PX1.<base64url(JCS(datos))>.<base64url(firma)>`, con la firma ECDSA P-256 (r‖s) de la tablet.
 *
 * `datos` usa los **números cortos** de la pantalla y el reto (los del contrato), no los ids: así
 * cualquiera puede verificar la firma con lo que se publica (`pantalla`, `reto`, `qr.e`, `qr.f` o
 * `qr.u`) y la llave registrada en Stellar.
 */
export const PREFIJO_QR_RETO = 'PX1';

export interface DatosQrReto {
  /** Número de la pantalla en el evento. */
  readonly p: number;
  /** Número del reto en el evento. */
  readonly r: number;
  /** Época de la pantalla: sube al invalidar los QR (HU-315). */
  readonly e: number;
  /** Por tiempo: la franja. */
  readonly f?: number;
  /** Un solo uso: el nonce (16 bytes en base64url). */
  readonly u?: string;
}

export interface QrRetoLeido {
  readonly datos: DatosQrReto;
  /** Los bytes firmados (el JCS de los datos). */
  readonly mensaje: Uint8Array;
  /** La firma en base64url, tal como la guarda el libro. */
  readonly firma: string;
}

const ALGORITMO = { name: 'ECDSA', hash: 'SHA-256' } as const;
const MAXIMO_QR = 400;

function isEnteroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0;
}

/** Los datos en el orden canónico (JCS): lo que se firma. */
function toMensaje(datos: DatosQrReto): Uint8Array {
  return encodeUtf8(canonicalizeJson(datos));
}

export async function buildQrReto(llave: CryptoKey, datos: DatosQrReto): Promise<string> {
  const mensaje = toMensaje(datos);
  const firma = await crypto.subtle.sign(ALGORITMO, llave, mensaje as BufferSource);
  return `${PREFIJO_QR_RETO}.${toBase64Url(mensaje)}.${toBase64Url(new Uint8Array(firma))}`;
}

/**
 * Lee el QR (también el enlace `…/r/PX1…` que abre la cámara del sistema). `null` si no tiene la
 * forma de un QR de reto: ni la firma se mira todavía.
 */
export function parseQrReto(texto: string): QrRetoLeido | null {
  const limpio = texto.trim();
  if (limpio.length > MAXIMO_QR + 200) return null;
  const desde = limpio.lastIndexOf(`${PREFIJO_QR_RETO}.`);
  if (desde < 0) return null;
  const qr = decodeURIComponent(limpio.slice(desde).split(/[?#]/)[0] ?? '');
  const partes = qr.split('.');
  if (partes.length !== 3 || qr.length > MAXIMO_QR) return null;
  try {
    const mensaje = fromBase64Url(partes[1] ?? '');
    const datos = JSON.parse(new TextDecoder().decode(mensaje)) as Record<string, unknown>;
    const claves = Object.keys(datos).sort().join(',');
    const valido =
      isEnteroNoNegativo(datos['p']) &&
      isEnteroNoNegativo(datos['r']) &&
      isEnteroNoNegativo(datos['e']) &&
      ((claves === 'e,f,p,r' && isEnteroNoNegativo(datos['f'])) ||
        (claves === 'e,p,r,u' &&
          typeof datos['u'] === 'string' &&
          /^[\w-]{16,43}$/.test(datos['u'])));
    if (!valido) return null;
    const leidos = datos as unknown as DatosQrReto;
    // Lo firmado tiene que ser exactamente el JCS: otro orden u otros espacios no valen.
    const canonico = toMensaje(leidos);
    if (canonico.length !== mensaje.length || canonico.some((b, i) => b !== mensaje[i])) {
      return null;
    }
    return { datos: leidos, mensaje, firma: partes[2] ?? '' };
  } catch {
    return null;
  }
}

/** Verifica la firma de la pantalla. Una firma mal formada es simplemente inválida. */
export async function verifyQrReto(llave: CryptoKey, leido: QrRetoLeido): Promise<boolean> {
  try {
    const firma = fromBase64Url(leido.firma);
    if (firma.length !== 64) return false;
    return await crypto.subtle.verify(
      ALGORITMO,
      llave,
      firma as BufferSource,
      leido.mensaje as BufferSource,
    );
  } catch {
    return false;
  }
}

/** La franja de un QR por tiempo, con la hora del servidor (HU-314 §3). */
export function getFranjaQr(horaServidorMs: number, rotacionSegundos: number): number {
  return Math.floor(horaServidorMs / (rotacionSegundos * 1000));
}
