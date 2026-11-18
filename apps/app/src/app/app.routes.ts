import { Route } from '@angular/router';
import { sesionGuard } from './sesion-asistente';

/** Rutas de la app del asistente (Aplicaciones web §2.1). */
export const appRoutes: Route[] = [
  {
    path: 'acceso/:tipo/:token',
    loadComponent: () => import('./acceso/acceso.page').then((m) => m.AccesoPage),
  },
  {
    path: 'inicio',
    canActivate: [sesionGuard],
    loadComponent: () => import('./inicio/inicio.page').then((m) => m.InicioPage),
  },
  {
    path: 'sin-acceso',
    loadComponent: () => import('./avisos.pages').then((m) => m.SinAccesoPage),
  },
  {
    path: 'anulado',
    loadComponent: () => import('./avisos.pages').then((m) => m.AnuladoPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: '**', redirectTo: 'inicio' },
];
