/**
 * Catálogo único de códigos de error del API (D40).
 * Fuente: docs/09-desarrollo/04-respuestas-y-errores.md §4.3.
 * Agregar un código es parte del PR que lo usa.
 */
export const CATALOGO_ERRORES = {
  // Generales
  VALIDACION: { status: 400, title: 'Datos inválidos', mensaje: 'Revisa los campos marcados.' },
  NO_ENCONTRADO: { status: 404, title: 'No encontrado', mensaje: 'No encontramos lo que buscas.' },
  DEMASIADOS_INTENTOS: {
    status: 429,
    title: 'Demasiados intentos',
    mensaje: 'Espera un momento e intenta de nuevo.',
  },
  ERROR_INTERNO: {
    status: 500,
    title: 'Error interno',
    mensaje: 'Algo salió mal. Intenta de nuevo.',
  },
  SERVICIO_NO_DISPONIBLE: {
    status: 503,
    title: 'Servicio no disponible',
    mensaje: 'El servicio no está disponible en este momento.',
  },
  IDEMPOTENCIA_CONFLICTO: {
    status: 409,
    title: 'Operación ya enviada',
    mensaje: 'Esta operación ya se envió con otros datos.',
  },
  // Equipo y sesión
  NO_AUTENTICADO: {
    status: 401,
    title: 'No autenticado',
    mensaje: 'Inicia sesión para continuar.',
  },
  SESION_VENCIDA: {
    status: 401,
    title: 'Sesión vencida',
    mensaje: 'Tu sesión venció. Inicia sesión de nuevo.',
  },
  SIN_PERMISO: { status: 403, title: 'Sin permiso', mensaje: 'No tienes permiso para esto.' },
} as const satisfies Record<string, DefinicionError>;

export interface DefinicionError {
  readonly status: number;
  readonly title: string;
  readonly mensaje: string;
}

export type CodigoError = keyof typeof CATALOGO_ERRORES;

/** Error de un campo, solo en `VALIDACION`. */
export interface ErrorDeCampo {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/** Cuerpo de una respuesta de error (Problem Details, RFC 9457, con extensiones). */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: CodigoError;
  readonly detail: string;
  readonly traceId: string;
  readonly errors?: readonly ErrorDeCampo[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** `urn:pasitos:error:<codigo-en-kebab>` mientras no exista el dominio. */
export function buildTipoError(code: CodigoError): string {
  return `urn:pasitos:error:${code.toLowerCase().replaceAll('_', '-')}`;
}

export function isCodigoError(valor: string): valor is CodigoError {
  return Object.hasOwn(CATALOGO_ERRORES, valor);
}
