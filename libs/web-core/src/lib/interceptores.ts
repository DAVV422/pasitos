import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { catchError, throwError, type Observable } from 'rxjs';
import { toErrorApi } from './error-api';

/** Id de traza para cada request (T-005 §2). */
export function createTraceId(): string {
  return globalThis.crypto.randomUUID();
}

/** Agrega `X-Request-Id`, que el API devuelve y usa en sus logs y en Sentry. */
export const traceIdInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  siguiente: HttpHandlerFn,
): Observable<HttpEvent<unknown>> =>
  siguiente(
    request.headers.has('X-Request-Id')
      ? request
      : request.clone({ setHeaders: { 'X-Request-Id': createTraceId() } }),
  );

/** Envía la cookie de sesión al API del mismo dominio (D49). Nada sensible en localStorage. */
export const credencialesInterceptor: HttpInterceptorFn = (request, siguiente) =>
  siguiente(request.clone({ withCredentials: true }));

/** Convierte todo error (incluida la falta de red) en un ErrorApi (Frontend §4–5). */
export const erroresInterceptor: HttpInterceptorFn = (request, siguiente) =>
  siguiente(request).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toErrorApi(error) : error)),
    ),
  );
