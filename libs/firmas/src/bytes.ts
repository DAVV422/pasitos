/** Utilidades de bytes que funcionan igual en Node y en el navegador (sin Buffer). */

const codificador = new TextEncoder();

export function encodeUtf8(texto: string): Uint8Array {
  return codificador.encode(texto);
}

export function concatBytes(...partes: readonly Uint8Array[]): Uint8Array {
  const total = partes.reduce((suma, parte) => suma + parte.length, 0);
  const resultado = new Uint8Array(total);
  let posicion = 0;
  for (const parte of partes) {
    resultado.set(parte, posicion);
    posicion += parte.length;
  }
  return resultado;
}

/** Entero sin signo de 32 bits en big-endian. */
export function encodeU32(valor: number): Uint8Array {
  if (!Number.isInteger(valor) || valor < 0 || valor > 0xffff_ffff) {
    throw new RangeError(`No es un u32: ${valor}`);
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, valor, false);
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  let texto = '';
  for (const byte of bytes) {
    texto += byte.toString(16).padStart(2, '0');
  }
  return texto;
}

export function fromHex(texto: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/.test(texto)) {
    throw new Error('Hexadecimal inválido (se esperan minúsculas y largo par)');
  }
  const bytes = new Uint8Array(texto.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(texto.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diferencia === 0;
}

/** SHA-256 con Web Crypto (`crypto.subtle`), disponible en Node 24 y en los navegadores de D42. */
export async function sha256(datos: Uint8Array): Promise<Uint8Array> {
  const copia = new Uint8Array(datos); // Garantiza un ArrayBuffer propio para subtle.digest.
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copia));
}
