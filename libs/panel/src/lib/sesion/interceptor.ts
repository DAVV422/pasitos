import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ErrorApi } from '@pasitos/web-core';
import { catchError, throwError } from 'rxjs';
import { SesionService } from './sesion.service';

/** Rutas que ya manejan su propio 401 (no hay que redirigir desde ellas). */
const SIN_REDIRECCION = ['/api/v1/auth/yo', '/api/v1/auth/login', '/api/v1/auth/segundo-factor'];

/**
 * Sesión vencida → `entrar?volver=…`; segundo factor pendiente → `segundo-factor?volver=…`
 * (HU-201 §7). Va por fuera de `erroresInterceptor`: recibe el ErrorApi.
 */
export const sesionInterceptor: HttpInterceptorFn = (request, siguiente) => {
  const router = inject(Router);
  const sesion = inject(SesionService);
  return siguiente(request).pipe(
    catchError((error: unknown) => {
      const propia = SIN_REDIRECCION.some((ruta) => request.url.startsWith(ruta));
      if (error instanceof ErrorApi && !propia) {
        const volver = router.url && router.url !== '/' ? { volver: router.url } : {};
        if (error.code === 'SESION_VENCIDA' || error.code === 'NO_AUTENTICADO') {
          sesion.set(null);
          void router.navigate(['/entrar'], { queryParams: volver });
        } else if (error.code === 'SEGUNDO_FACTOR_REQUERIDO') {
          const configurar = error.meta['motivo'] === 'configurar';
          void sesion.reload();
          void router.navigate([configurar ? '/segundo-factor/configurar' : '/segundo-factor'], {
            queryParams: volver,
          });
        }
      }
      return throwError(() => error);
    }),
  );
};
