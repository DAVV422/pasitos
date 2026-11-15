import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  type HttpInterceptorFn,
} from '@angular/common/http';
import type { EnvironmentProviders } from '@angular/core';
import { credencialesInterceptor, erroresInterceptor, traceIdInterceptor } from './interceptores';

/**
 * HttpClient con los interceptores comunes, en el orden de Frontend §4:
 * traceId → credenciales → errores. Las apps suman los suyos (por ejemplo, la firma en /app).
 */
export function provideWebCore(
  /** Van por fuera de `erroresInterceptor`: reciben el error ya convertido en ErrorApi. */
  propios: readonly HttpInterceptorFn[] = [],
): EnvironmentProviders {
  return provideHttpClient(
    withFetch(),
    withInterceptors([traceIdInterceptor, credencialesInterceptor, ...propios, erroresInterceptor]),
  );
}
