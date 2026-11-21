import { SetMetadata } from '@nestjs/common';
import { bitacora, type Tx } from '@pasitos/db';
import { NOMBRES_ROL, type AccionBitacora, type RolEvento } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';

export const META_ACCION_BITACORA = 'pasitos:accion-bitacora';

/**
 * La acción que deja una ruta de escritura (HU-213 §5). Una ruta de escritura sin esta marca no
 * arranca (`checkMarcasDeRutas`), y los tests de cada HU comprueban que quede su fila.
 */
export const AccionBitacoraDe = (accion: AccionBitacora) =>
  SetMetadata(META_ACCION_BITACORA, accion);

/** Quién hizo la acción. */
export type ActorBitacora =
  | {
      readonly tipo: 'usuario';
      readonly id: string;
      readonly nombre: string;
      /** Rol del evento (`registrador`) o de plataforma (`admin`). */
      readonly rol: string | null;
      readonly dispositivo?: string | null;
    }
  | { readonly tipo: 'pantalla' | 'mesa'; readonly id: string; readonly nombre: string }
  | { readonly tipo: 'sistema'; readonly nombre: string };

export const ACTOR_SISTEMA: ActorBitacora = { tipo: 'sistema', nombre: 'Pasitos (automático)' };

export interface EntradaBitacora {
  readonly actor: ActorBitacora;
  readonly accion: AccionBitacora;
  /** `null` en las acciones de la consola sobre una organización (las escribe pasitos_sistema). */
  readonly organizacionId: string | null;
  readonly eventoId: string | null;
  readonly objeto?: { readonly tipo: string; readonly id: string; readonly nombre: string };
  readonly antes?: Readonly<Record<string, unknown>>;
  readonly despues?: Readonly<Record<string, unknown>>;
}

/**
 * Nunca en la bitácora (HU-213 §1): contraseñas, tokens, PIN, secretos, llaves, IP, huellas.
 * Se comparan sin mayúsculas ni guiones contra el nombre de cada campo, a cualquier profundidad.
 */
export const CAMPOS_PROHIBIDOS = [
  'password',
  // HU-411: el número del asistente nunca va a la bitácora.
  'celular',
  'contrasena',
  'passwordhash',
  'token',
  'tokenhash',
  'pin',
  'pinhash',
  'secreto',
  'secret',
  'totp',
  'llave',
  'llavepublica',
  'publickey',
  'clave',
  'ip',
  'huella',
  'fingerprint',
  'cookie',
] as const;

const PROHIBIDOS = new Set<string>(CAMPOS_PROHIBIDOS);

function isProhibido(campo: string): boolean {
  const normal = campo.toLowerCase().replace(/[_-]/g, '');
  return (
    PROHIBIDOS.has(normal) ||
    [...PROHIBIDOS].some((p) => p.length > 3 && (normal.startsWith(p) || normal.endsWith(p)))
  );
}

/** Quita los campos prohibidos (también dentro de objetos y listas). */
export function sanitize(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(sanitize);
  }
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  if (Buffer.isBuffer(valor)) {
    return '[bytes]';
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([campo]) => !isProhibido(campo))
        .map(([campo, interno]) => [campo, sanitize(interno)]),
    );
  }
  return valor;
}

function isIgual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sanitize(a)) === JSON.stringify(sanitize(b));
}

/** Solo los campos que cambiaron, de los dos lados (HU-213 §1). */
export function diff(
  antes: Readonly<Record<string, unknown>>,
  despues: Readonly<Record<string, unknown>>,
): { antes: Record<string, unknown>; despues: Record<string, unknown> } {
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const resultado = {
    antes: {} as Record<string, unknown>,
    despues: {} as Record<string, unknown>,
  };
  for (const campo of campos) {
    if (!isIgual(antes[campo], despues[campo])) {
      resultado.antes[campo] = antes[campo] ?? null;
      resultado.despues[campo] = despues[campo] ?? null;
    }
  }
  return resultado;
}

/** "Registrador", o el rol de plataforma tal cual. */
export function getNombreRol(rol: string | null): string | null {
  return rol && rol in NOMBRES_ROL ? NOMBRES_ROL[rol as RolEvento] : rol;
}

/**
 * La forma única de escribir en la bitácora (HU-213): **dentro de la transacción de la acción**.
 * Si la acción se deshace, la fila también; si la bitácora falla, la acción falla.
 */
export class BitacoraService {
  async record(tx: Tx, entrada: EntradaBitacora): Promise<string> {
    const id = uuidv7();
    const { actor } = entrada;
    await tx.insert(bitacora).values({
      id,
      organizacionId: entrada.organizacionId,
      eventoId: entrada.eventoId,
      actorTipo: actor.tipo,
      actorId: actor.tipo === 'sistema' ? null : actor.id,
      actorNombre: actor.nombre,
      actorRol: actor.tipo === 'usuario' ? getNombreRol(actor.rol) : null,
      accion: entrada.accion,
      objetoTipo: entrada.objeto?.tipo ?? null,
      objetoId: entrada.objeto?.id ?? null,
      objetoNombre: entrada.objeto?.nombre ?? null,
      antes: entrada.antes ? sanitize(entrada.antes) : null,
      despues: entrada.despues ? sanitize(entrada.despues) : null,
      dispositivoModelo: actor.tipo === 'usuario' ? (actor.dispositivo ?? null) : null,
    });
    return id;
  }
}

/** Actor de la consola de plataforma (persona con sesión o un comando) para la bitácora. */
export function toActorBitacora(actor: {
  readonly tipo: 'usuario' | 'sistema';
  readonly id: string | null;
  readonly nombre: string;
  readonly rol: string | null;
}): ActorBitacora {
  return actor.tipo === 'usuario' && actor.id
    ? { tipo: 'usuario', id: actor.id, nombre: actor.nombre, rol: actor.rol }
    : { tipo: 'sistema', nombre: actor.nombre };
}
