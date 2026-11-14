import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import type { EnvironmentProviders } from '@angular/core';
import { credencialesInterceptor, erroresInterceptor, traceIdInterceptor } from './interceptores';

/**
 * HttpClient con los interceptores comunes, en el orden de Frontend §4:
 * traceId → credenciales → errores. Las apps suman los suyos (por ejemplo, la firma en /app).
 */
export function provideWebCore(): EnvironmentProviders {
  return provideHttpClient(
    withFetch(),
    withInterceptors([traceIdInterceptor, credencialesInterceptor, erroresInterceptor]),
  );
}
