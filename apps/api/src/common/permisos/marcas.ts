import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { AppError, type AccionEvento, type RolEvento } from '@pasitos/dominio';
import type { FastifyRequest } from 'fastify';

export const META_SOLO_SESION = 'pasitos:solo-sesion';
export const META_PERMISO = 'pasitos:permiso';
export const META_PLATAFORMA = 'pasitos:plataforma';

/**
 * Tablas de las que se puede resolver el evento de un recurso (`/retos/:id` → su evento). Lista
 * cerrada: el nombre va en el SQL. Cada HU suma las suyas.
 */
export const TABLAS_RECURSO = {
  eventos: 'eventos',
  retos: 'retos',
  pantallas: 'pantallas',
  miembros: 'miembros_evento',
  lugares: 'lugares',
  actividades: 'actividades',
  sponsors: 'sponsors',
  preguntas: 'preguntas_frecuentes',
  premios: 'premios',
  mesas: 'mesas',
  asistentes: 'asistentes',
  operaciones: 'operaciones',
  importaciones: 'operaciones',
  // HU-302: el id del acceso es el del token del QR.
  accesos: 'tokens',
  alertas: 'alertas',
  canjes: 'canjes',
  qrRegistro: 'qr_registro',
  grupos: 'grupos',
} as const;
export type RecursoEvento = keyof typeof TABLAS_RECURSO;

export interface OpcionesPermiso {
  /** Si la ruta no tiene `:eventoId`, de qué tabla es el `:id` (o el parámetro de `param`). */
  readonly recurso?: RecursoEvento;
  readonly param?: string;
}

export interface DefinicionPermiso extends OpcionesPermiso {
  readonly accion: AccionEvento;
}

/**
 * Ruta de un evento: exige el rol que dice la matriz (HU-204 §2). Sin rol en el evento: 404
 * (no se revela que existe); con rol sin permiso: 403 SIN_PERMISO; evento cerrado y acción de
 * escritura: 422 EVENTO_CERRADO.
 */
export const Permiso = (accion: AccionEvento, opciones: OpcionesPermiso = {}) =>
  SetMetadata(META_PERMISO, { accion, ...opciones } satisfies DefinicionPermiso);

/**
 * Ruta de la consola de plataforma (HU-202 §1): `lectura` para cualquier rol de plataforma
 * (👁), `escritura` para `superadmin` y `admin` (✏️) y `superadmin` solo para él (👑). Sin rol de
 * plataforma: 404 (la consola no se anuncia).
 */
export type NivelPlataforma = 'lectura' | 'escritura' | 'superadmin';
export const Plataforma = (nivel: NivelPlataforma) => SetMetadata(META_PLATAFORMA, nivel);

/** Ruta con sesión que no es de un evento (`/auth/*`, la lista de mis eventos…). */
export const SoloSesion = () => SetMetadata(META_SOLO_SESION, true);

/** Lo que el guard de permisos deja en la request. */
export interface ContextoEvento {
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly dispositivo: string | null;
  readonly eventoId: string;
  readonly organizacionId: string;
  readonly eventoEstado: string;
  readonly rol: RolEvento;
  /** `null` para el dueño de la organización (no está en `miembros_evento`). */
  readonly miembroId: string | null;
  readonly terminales: { readonly pantallas: readonly string[]; readonly mesas: readonly string[] };
}

export type RequestConContexto = FastifyRequest & { contexto?: ContextoEvento };

/** El contexto del evento en el controlador. Los servicios lo reciben y abren `withOrganizacion`. */
export const Contexto = createParamDecorator((_: unknown, ejecucion: ExecutionContext) => {
  const contexto = ejecucion.switchToHttp().getRequest<RequestConContexto>().contexto;
  if (!contexto) {
    throw new AppError('ERROR_INTERNO', { detail: 'Ruta sin @Permiso' });
  }
  return contexto;
});
