import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./conectar/conectar.page').then((m) => m.ConectarPage),
  },
  {
    path: 'pantalla',
    loadComponent: () => import('./pantalla/pantalla.page').then((m) => m.PantallaPage),
  },
  {
    path: 'conectar/:token',
    loadComponent: () => import('./conectar/conectar.page').then((m) => m.ConectarPage),
  },
];
