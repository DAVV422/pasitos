import { Algorithm, hash, verify } from '@node-rs/argon2';
import { PASSWORD_LARGO_MAX, PASSWORD_LARGO_MIN } from '@pasitos/dominio/esquemas';

/**
 * Contraseñas del equipo y de Pasitos (HU-201 §2, D26). Argon2id con la recomendación de OWASP.
 * La contraseña nunca va a logs, a la bitácora ni a una respuesta.
 */
export const PARAMETROS_ARGON2 = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export { PASSWORD_LARGO_MAX, PASSWORD_LARGO_MIN } from '@pasitos/dominio/esquemas';

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMETROS_ARGON2);
}

/** `false` también si el hash está vacío o no es de Argon2. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Solo el largo. HU-201 suma las contraseñas filtradas (HIBP) y la lista de comunes.
 * Devuelve el motivo del rechazo o `null` si sirve.
 */
export function checkPasswordLargo(password: string): 'corta' | 'larga' | null {
  const largo = [...password].length;
  if (largo < PASSWORD_LARGO_MIN) {
    return 'corta';
  }
  return largo > PASSWORD_LARGO_MAX ? 'larga' : null;
}
