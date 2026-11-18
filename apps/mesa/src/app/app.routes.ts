import { Route } from '@angular/router';

/** Rutas de la mesa de canje (Aplicaciones web §4.1). */
export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./conectar/conectar.page').then((m) => m.ConectarPage),
  },
  {
    path: 'conectar/:token',
    loadComponent: () => import('./conectar/conectar.page').then((m) => m.ConectarPage),
  },
  {
    path: 'canje',
    loadComponent: () => import('./canje/nuevo-canje.page').then((m) => m.NuevoCanjePage),
  },
  {
    path: 'cobro/:id',
    loadComponent: () => import('./canje/cobro.page').then((m) => m.CobroPage),
  },
  {
    path: 'historial',
    loadComponent: () => import('./canje/historial.page').then((m) => m.HistorialPage),
  },
];
