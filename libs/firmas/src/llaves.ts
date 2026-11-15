/**
 * La llave de una pantalla (HU-209 §3): P-256, creada en la tablet y **no exportable**. Al servidor
 * va solo la parte pública (JWK), que el contrato guarda como 65 bytes sin comprimir (`04‖x‖y`).
 * Funciona en el navegador y en Node (WebCrypto).
 */
export interface LlavePublicaEc {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
}

function fromBase64Url(texto: string): Uint8Array {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** JWK pública → los 65 bytes sin comprimir que guarda el contrato. */
export function toLlaveCruda(jwk: LlavePublicaEc): Uint8Array {
  const x = fromBase64Url(jwk.x);
  const y = fromBase64Url(jwk.y);
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('Llave P-256 inválida');
  }
  const cruda = new Uint8Array(65);
  cruda[0] = 0x04;
  cruda.set(x, 1);
  cruda.set(y, 33);
  return cruda;
}

/** Crea el par de llaves de una pantalla: la privada no se puede exportar nunca. */
export async function createParLlaves(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** La parte pública, para mandarla al conectar. */
export async function exportLlavePublica(par: CryptoKeyPair): Promise<LlavePublicaEc> {
  const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
  return { kty: 'EC', crv: 'P-256', x: jwk.x ?? '', y: jwk.y ?? '' };
}
