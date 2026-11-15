import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { AppEquipo } from '@pasitos/dominio/esquemas';
import { ErrorApi } from '@pasitos/web-core';
import { AuthApi, type Yo } from './auth-api.service';

/** Qué app del equipo es (para los enlaces de los correos y los textos). */
export const APP_EQUIPO = new InjectionToken<AppEquipo>('APP_EQUIPO');

/** Sin sesión: el API dice que no hay o que venció. */
export function isSinSesion(error: unknown): boolean {
  return (
    error instanceof ErrorApi &&
    (error.code === 'NO_AUTENTICADO' || error.code === 'SESION_VENCIDA')
  );
}

/**
 * La sesión del equipo en el panel (HU-201 §7), con signals. La fuente es `GET /auth/yo`: la
 * cookie es HttpOnly y el panel no la ve.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly api = inject(AuthApi);
  private cargando: Promise<Yo | null> | null = null;

  private readonly actual = signal<Yo | null>(null);
  private readonly cargada = signal(false);

  readonly yo = this.actual.asReadonly();
  readonly usuario = computed(() => this.actual()?.usuario ?? null);
  /** `sin_sesion`, o el estado del segundo factor de la sesión. */
  readonly estado = computed(() => this.actual()?.segundoFactor.estado ?? 'sin_sesion');

  /** La sesión, cargándola una vez si hace falta. */
  ensure(): Promise<Yo | null> {
    if (this.cargada()) {
      return Promise.resolve(this.actual());
    }
    return this.reload();
  }

  reload(): Promise<Yo | null> {
    this.cargando ??= this.api
      .getYo()
      .then((yo) => this.set(yo))
      .catch((error: unknown) => {
        if (isSinSesion(error)) {
          return this.set(null);
        }
        throw error;
      })
      .finally(() => {
        this.cargando = null;
      });
    return this.cargando;
  }

  set(yo: Yo | null): Yo | null {
    this.actual.set(yo);
    this.cargada.set(true);
    return yo;
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.set(null);
    }
  }
}
