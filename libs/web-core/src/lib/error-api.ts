import { HttpErrorResponse } from '@angular/common/http';
import { isCodigoError, type CodigoError, type ErrorDeCampo } from '@pasitos/dominio';

/** Códigos que solo existen en el cliente (no los manda el API). */
export type CodigoErrorLocal = 'SIN_CONEXION' | 'DESCONOCIDO';

/**
 * Todo error de una llamada al API, ya normalizado (Frontend §5.3).
 * Las pantallas deciden por `code`, nunca por el texto.
 */
export class ErrorApi extends Error {
  constructor(
    readonly code: CodigoError | CodigoErrorLocal,
    readonly status: number,
    readonly detail: string,
    readonly traceId: string | null,
    readonly errors: readonly ErrorDeCampo[] = [],
    readonly meta: Readonly<Record<string, unknown>> = {},
  ) {
    super(detail);
    this.name = 'ErrorApi';
  }
}

interface CuerpoProblemDetails {
  readonly code?: unknown;
  readonly detail?: unknown;
  readonly traceId?: unknown;
  readonly errors?: unknown;
  readonly meta?: unknown;
}

/** Convierte la respuesta de error de HttpClient en un ErrorApi. */
export function toErrorApi(respuesta: HttpErrorResponse): ErrorApi {
  const traceIdCabecera = respuesta.headers?.get('X-Request-Id') ?? null;
  if (respuesta.status === 0) {
    return new ErrorApi(
      'SIN_CONEXION',
      0,
      'No pudimos conectar. Intenta de nuevo.',
      traceIdCabecera,
    );
  }
  const cuerpo: CuerpoProblemDetails =
    typeof respuesta.error === 'object' && respuesta.error !== null ? respuesta.error : {};
  const code =
    typeof cuerpo.code === 'string' && isCodigoError(cuerpo.code) ? cuerpo.code : 'DESCONOCIDO';
  const detail =
    typeof cuerpo.detail === 'string' ? cuerpo.detail : 'Algo salió mal. Intenta de nuevo.';
  const traceId = typeof cuerpo.traceId === 'string' ? cuerpo.traceId : traceIdCabecera;
  const errors = Array.isArray(cuerpo.errors) ? (cuerpo.errors as ErrorDeCampo[]) : [];
  const meta =
    typeof cuerpo.meta === 'object' && cuerpo.meta !== null
      ? (cuerpo.meta as Record<string, unknown>)
      : {};
  return new ErrorApi(code, respuesta.status, detail, traceId, errors, meta);
}
