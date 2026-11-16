import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de datos en la base (HU-201 §6): el secreto de TOTP, el desafío de WebAuthn y los
 * enlaces de invitación (ajuste 6). AES-256-GCM con un IV aleatorio de 12 bytes.
 *
 * Formato: [versión de la llave: 1 byte][IV: 12][etiqueta: 16][texto cifrado]. La versión permite
 * rotar la llave: se cifra con la actual y se descifra con la que diga el primer byte.
 * La llave la pasa quien lo usa (el API y el trabajador, de `LLAVE_CIFRADO_DATOS`): esta librería no la conoce.
 */
const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;

export interface LlaveCifrado {
  readonly version: number;
  readonly llave: Buffer;
}

export class Cifrador {
  private readonly porVersion: ReadonlyMap<number, Buffer>;

  constructor(
    private readonly actual: LlaveCifrado,
    anteriores: readonly LlaveCifrado[] = [],
  ) {
    this.porVersion = new Map([...anteriores, actual].map((l) => [l.version, l.llave]));
  }

  encrypt(texto: string | Buffer): Buffer {
    const iv = randomBytes(LARGO_IV);
    const cifrador = createCipheriv('aes-256-gcm', this.actual.llave, iv);
    const cifrado = Buffer.concat([cifrador.update(texto), cifrador.final()]);
    return Buffer.concat([Buffer.from([this.actual.version]), iv, cifrador.getAuthTag(), cifrado]);
  }

  decrypt(datos: Buffer): Buffer {
    const llave = this.porVersion.get(datos[0] ?? -1);
    if (!llave || datos.length < 1 + LARGO_IV + LARGO_ETIQUETA) {
      throw new Error('Dato cifrado con una llave desconocida o incompleto');
    }
    const iv = datos.subarray(1, 1 + LARGO_IV);
    const etiqueta = datos.subarray(1 + LARGO_IV, 1 + LARGO_IV + LARGO_ETIQUETA);
    const descifrador = createDecipheriv('aes-256-gcm', llave, iv);
    descifrador.setAuthTag(etiqueta);
    return Buffer.concat([
      descifrador.update(datos.subarray(1 + LARGO_IV + LARGO_ETIQUETA)),
      descifrador.final(),
    ]);
  }

  decryptTexto(datos: Buffer): string {
    return this.decrypt(datos).toString('utf-8');
  }
}

/** `base64` (versión 1) o `version:base64`, con 32 bytes. */
export function parseLlaveCifrado(valor: string): LlaveCifrado {
  const [primero, segundo] = valor.trim().split(':');
  const conVersion = segundo !== undefined;
  const version = conVersion ? Number(primero) : 1;
  const llave = Buffer.from((conVersion ? segundo : primero) ?? '', 'base64');
  if (!Number.isInteger(version) || version < 1 || version > 255) {
    throw new Error('La versión de la llave de cifrado va de 1 a 255');
  }
  if (llave.length !== 32) {
    throw new Error('La llave de cifrado tiene que tener 32 bytes en base64');
  }
  return { version, llave };
}

export function buildCifrador(actual: string, anteriores: string): Cifrador {
  return new Cifrador(
    parseLlaveCifrado(actual),
    anteriores
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map(parseLlaveCifrado),
  );
}
