import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * App de códigos (TOTP, RFC 6238) para el segundo factor (HU-201 §4): HMAC-SHA1, pasos de 30 s y
 * 6 dígitos, que es lo que entienden Google Authenticator, Microsoft Authenticator y similares.
 * Se acepta el paso anterior y el siguiente (±30 s de diferencia de reloj). Devuelve el paso que
 * coincidió, para guardarlo y no aceptar el mismo código dos veces.
 */
export const PASO_SEGUNDOS = 30;
const DIGITOS = 6;
const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 20 bytes aleatorios en base32 (lo que se muestra y va en el QR). */
export function createSecretoTotp(): string {
  return encodeBase32(randomBytes(20));
}

export function getPaso(fecha: Date): number {
  return Math.floor(fecha.getTime() / 1000 / PASO_SEGUNDOS);
}

export function generateCodigoTotp(secreto: string, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac('sha1', decodeBase32(secreto)).update(contador).digest();
  const desfase = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const numero = (hmac.readUInt32BE(desfase) & 0x7fffffff) % 10 ** DIGITOS;
  return numero.toString().padStart(DIGITOS, '0');
}

/**
 * El paso que coincide con el código (−1, 0 o +1 respecto de `ahora`), o `null`. Un paso igual o
 * anterior a `ultimoPaso` ya se usó y no vale.
 */
export function verifyCodigoTotp(
  secreto: string,
  codigo: string,
  ahora: Date,
  ultimoPaso: number | null,
): number | null {
  if (!/^\d{6}$/.test(codigo)) {
    return null;
  }
  const actual = getPaso(ahora);
  for (const paso of [actual - 1, actual, actual + 1]) {
    if (ultimoPaso !== null && paso <= ultimoPaso) {
      continue;
    }
    const esperado = generateCodigoTotp(secreto, paso);
    if (timingSafeEqual(Buffer.from(esperado), Buffer.from(codigo))) {
      return paso;
    }
  }
  return null;
}

/** `otpauth://` para el QR que escanea la app. */
export function buildOtpauthUrl(secreto: string, cuenta: string, emisor: string): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const parametros = new URLSearchParams({
    secret: secreto,
    issuer: emisor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASO_SEGUNDOS),
  });
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`;
}

export function encodeBase32(datos: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  }
  return salida;
}

export function decodeBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caracter of limpio) {
    const indice = ALFABETO_BASE32.indexOf(caracter);
    if (indice < 0) {
      throw new Error('Secreto TOTP inválido');
    }
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
