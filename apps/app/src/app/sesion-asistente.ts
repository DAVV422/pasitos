import { inject, Injectable, signal } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { COOKIE_DISPOSITIVO, ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type EstadoApp } from './asistente-api.service';

/** Cómo se anuló este celular (`DISPOSITIVO_NO_VINCULADO`), para la pantalla de *anulado*. */
export interface Anulacion {
  readonly anuladaAt: string | null;
  readonly metodo: string | null;
}

/**
 * La sesión del asistente en la app (HU-306 §6): el último estado del servidor y, si este celular
 * perdió la entrada, cuándo. La sesión vive en la cookie `px_asistente` (`HttpOnly`).
 */
@Injectable({ providedIn: 'root' })
export class SesionAsistente {
  private readonly api = inject(AsistenteApi);
  readonly estado = signal<EstadoApp | null>(null);
  readonly anulacion = signal<Anulacion | null>(null);

  set(estado: EstadoApp): void {
    this.anulacion.set(null);
    this.estado.set(estado);
  }

  /** Pide el estado. `sin_sesion` y `anulado` los decide el guard. */
  async load(): Promise<'ok' | 'sin_sesion' | 'anulado'> {
    try {
      this.set(await this.api.getEstado());
      return 'ok';
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'DISPOSITIVO_NO_VINCULADO') {
        this.anulacion.set({
          anuladaAt: typeof error.meta['anuladaAt'] === 'string' ? error.meta['anuladaAt'] : null,
          metodo: typeof error.meta['metodo'] === 'string' ? error.meta['metodo'] : null,
        });
        return 'anulado';
      }
      if (
        error instanceof ErrorApi &&
        (error.code === 'NO_AUTENTICADO' || error.code === 'SESION_VENCIDA')
      ) {
        return 'sin_sesion';
      }
      throw error;
    }
  }
}

/** Las pantallas de la app piden una sesión: sin ella, cómo entrar; anulada, el aviso. */
export const sesionGuard: CanActivateFn = async () => {
  const sesion = inject(SesionAsistente);
  const router = inject(Router);
  if (sesion.estado()) {
    return true;
  }
  // Un navegador que nunca se vinculó no tiene su id: no hace falta preguntar al servidor.
  if (!document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE_DISPOSITIVO}=`))) {
    return router.parseUrl('/sin-acceso');
  }
  const resultado = await sesion.load();
  if (resultado === 'ok') return true;
  return router.parseUrl(resultado === 'anulado' ? '/anulado' : '/sin-acceso');
};
