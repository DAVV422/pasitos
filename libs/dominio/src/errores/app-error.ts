import type { CodigoError, ErrorDeCampo } from './catalogo';

/**
 * Error de negocio con un código del catálogo (D40).
 * Los servicios lanzan AppError; nunca HttpException (Backend §11).
 * Vive en libs/dominio porque la lanzan también las librerías del servidor (libs/libro) y el trabajador.
 */
export class AppError extends Error {
  readonly code: CodigoError;
  readonly meta: Readonly<Record<string, unknown>> | undefined;
  readonly errors: readonly ErrorDeCampo[] | undefined;

  constructor(
    code: CodigoError,
    opciones: {
      meta?: Record<string, unknown>;
      errors?: readonly ErrorDeCampo[];
      detail?: string;
    } = {},
  ) {
    super(opciones.detail ?? code);
    this.name = 'AppError';
    this.code = code;
    this.meta = opciones.meta;
    this.errors = opciones.errors;
  }
}
