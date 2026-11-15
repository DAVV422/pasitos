import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { MotivoPasswordInsegura } from '@pasitos/dominio/esquemas';
import { COMUNES } from './datos/comunes';
import { checkPasswordLargo } from './password';

/** ¿La contraseña apareció en una filtración? (V16, HU-201 §2). */
export interface PasswordsFiltradasPort {
  /** `null` si no se pudo saber (el servicio no respondió). */
  isFiltrada(password: string): Promise<boolean | null>;
}

export const PASSWORDS_FILTRADAS = Symbol('PASSWORDS_FILTRADAS');

/**
 * Have I Been Pwned con k-anonimato: solo salen los 5 primeros caracteres del SHA-1, nunca la
 * contraseña. Si no responde en 2 s, `null` (decide la lista local; no se bloquea a nadie por una
 * caída externa).
 */
export class HibpAdapter implements PasswordsFiltradasPort {
  private readonly logger = new Logger(HibpAdapter.name);

  constructor(
    private readonly espera = 2_000,
    private readonly url = 'https://api.pwnedpasswords.com/range/',
  ) {}

  async isFiltrada(password: string): Promise<boolean | null> {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefijo = sha1.slice(0, 5);
    const resto = sha1.slice(5);
    try {
      const respuesta = await fetch(`${this.url}${prefijo}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'Pasitos' },
        signal: AbortSignal.timeout(this.espera),
      });
      if (!respuesta.ok) {
        throw new Error(`HIBP respondió ${respuesta.status}`);
      }
      const cuerpo = await respuesta.text();
      return cuerpo.split('\n').some((linea) => {
        const [sufijo, veces] = linea.trim().split(':');
        return sufijo === resto && Number(veces) > 0;
      });
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'No se pudo consultar HIBP; se decide con la lista local',
      );
      return null;
    }
  }
}

/** Sin consulta externa (tests y CI, `HIBP_ACTIVO=false`). */
export class SinConsultaFiltradas implements PasswordsFiltradasPort {
  isFiltrada(): Promise<boolean | null> {
    return Promise.resolve(null);
  }
}

/**
 * Las 2 000 más comunes de 8 o más caracteres y variantes locales: *pasitos*, *bolivia*,
 * *contraseña*… con el año o números seguidos.
 */
const BASES_LOCALES = [
  'pasitos',
  'contraseña',
  'contrasena',
  'bolivia',
  'santacruz',
  'cochabamba',
  'lapaz',
  'evento',
  'eventos',
  'organizador',
  'admin',
  'administrador',
  'password',
];
const SUFIJOS_LOCALES = [
  '',
  '1',
  '12',
  '123',
  '1234',
  '12345',
  '123456',
  '!',
  '.',
  ...Array.from({ length: 21 }, (_, i) => String(2015 + i)),
];

function buildListaComunes(): ReadonlySet<string> {
  const lista = new Set(
    COMUNES.split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0),
  );
  for (const base of BASES_LOCALES) {
    for (const sufijo of SUFIJOS_LOCALES) {
      lista.add(`${base}${sufijo}`);
    }
  }
  return lista;
}

const LISTA_COMUNES = buildListaComunes();

export function isComun(password: string): boolean {
  const normal = password.trim().toLowerCase();
  return LISTA_COMUNES.has(normal) || /^(.)\1+$/.test(normal) || /^\d+$/.test(normal);
}

/** Motivo por el que no sirve, o `null` (HU-201 §2). */
export async function checkPassword(
  password: string,
  filtradas: PasswordsFiltradasPort,
): Promise<MotivoPasswordInsegura | null> {
  const largo = checkPasswordLargo(password);
  if (largo) {
    return largo;
  }
  if (isComun(password)) {
    return 'comun';
  }
  return (await filtradas.isFiltrada(password)) === true ? 'filtrada' : null;
}
