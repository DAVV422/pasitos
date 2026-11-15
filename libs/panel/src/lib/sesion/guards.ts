import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';
import type { Yo } from './auth-api.service';
import { SesionService } from './sesion.service';

/** Adónde tiene que ir alguien según su sesión, o `null` si puede seguir a una pantalla común. */
export function getDestinoPendiente(yo: Yo | null): string | null {
  if (!yo) {
    return '/entrar';
  }
  if (yo.segundoFactor.estado === 'por_configurar') {
    return '/segundo-factor/configurar';
  }
  if (yo.segundoFactor.estado === 'por_verificar') {
    return '/segundo-factor';
  }
  return null;
}

function toVolver(router: Router, destino: string, url: string): UrlTree {
  return router.createUrlTree(
    [destino],
    url && url !== '/' ? { queryParams: { volver: url } } : {},
  );
}

/** Pantallas del panel: con sesión y con el segundo factor al día (HU-201 §7). */
export const sesionGuard: CanActivateFn = async (_, estado) => {
  const router = inject(Router);
  const destino = getDestinoPendiente(await inject(SesionService).ensure());
  return destino ? toVolver(router, destino, estado.url) : true;
};

/** `entrar` y `recuperar`: si ya hay una sesión completa, al inicio. */
export const sinSesionGuard: CanActivateFn = async () => {
  const yo = await inject(SesionService).ensure();
  return yo && getDestinoPendiente(yo) === null ? inject(Router).createUrlTree(['/']) : true;
};

/** `segundo-factor`: solo con el segundo factor por pasar. */
export const verificarGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const destino = getDestinoPendiente(await inject(SesionService).ensure());
  return destino === '/segundo-factor' ? true : router.createUrlTree([destino ?? '/']);
};

/** `segundo-factor/configurar`: con sesión; o porque lo necesita, o porque suma otro método. */
export const configurarGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const destino = getDestinoPendiente(await inject(SesionService).ensure());
  if (destino === '/entrar' || destino === '/segundo-factor') {
    return router.createUrlTree([destino]);
  }
  return true;
};
