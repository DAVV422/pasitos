import { Route } from '@angular/router';

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
];
