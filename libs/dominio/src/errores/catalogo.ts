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
  CREDENCIALES_INVALIDAS: {
    status: 401,
    title: 'Correo o contraseña incorrectos',
    mensaje: 'El correo o la contraseña no son correctos.',
  },
  SEGUNDO_FACTOR_REQUERIDO: {
    status: 401,
    title: 'Falta el segundo factor',
    mensaje: 'Confirma tu identidad con tu segundo factor.',
  },
  CODIGO_INVALIDO: {
    status: 401,
    title: 'Código incorrecto',
    mensaje: 'El código no es correcto o ya venció. Prueba con el que muestra tu app ahora.',
  },
  PASSWORD_INSEGURA: {
    status: 422,
    title: 'Contraseña insegura',
    mensaje: 'Elige otra contraseña: esta es muy corta o muy conocida.',
  },
  ENLACE_VENCIDO: {
    status: 422,
    title: 'Enlace vencido',
    mensaje: 'Este enlace ya no sirve. Pide uno nuevo.',
  },
  ENLACE_YA_USADO: {
    status: 409,
    title: 'Enlace ya usado',
    mensaje: 'Este enlace ya se usó. Si eras tú, entra con tu cuenta.',
  },
  INVITACION_EQUIPO_OTRO_CORREO: {
    status: 403,
    title: 'La invitación es para otra cuenta',
    mensaje: 'Esta invitación es para otro correo. Entra con esa cuenta.',
  },
  ROL_NO_PERMITIDO: {
    status: 403,
    title: 'Rol no permitido',
    mensaje: 'No puedes invitar, cambiar ni quitar a alguien con ese rol.',
  },
  // Evento
  EVENTO_CERRADO: {
    status: 422,
    title: 'Evento cerrado',
    mensaje: 'El evento ya cerró. Los puntos vencieron.',
  },
  // Retos y puntos
  RETO_YA_COMPLETADO: {
    status: 409,
    title: 'Reto ya completado',
    mensaje: 'Ya completaste este reto.',
  },
  RETO_NO_DISPONIBLE: {
    status: 422,
    title: 'Reto no disponible',
    mensaje: 'Este reto no está activo ahora.',
  },
  TOPE_ALCANZADO: {
    status: 422,
    title: 'Tope alcanzado',
    mensaje: 'Este reto ya entregó todos sus premios.',
  },
  TOPE_PUNTOS_PERSONA: {
    status: 422,
    title: 'Máximo de puntos alcanzado',
    mensaje: 'Llegaste al máximo de puntos de este evento.',
  },
  // Canjes
  SALDO_INSUFICIENTE: {
    status: 409,
    title: 'Saldo insuficiente',
    mensaje: 'Te faltan puntos para este canje.',
  },
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
