import { Route } from '@angular/router';
import { sesionGuard } from './sesion-asistente';

/** Rutas de la app del asistente (Aplicaciones web §2.1). */
export const appRoutes: Route[] = [
  {
    path: 'acceso/:tipo/:token',
    loadComponent: () => import('./acceso/acceso.page').then((m) => m.AccesoPage),
  },
  {
    path: '',
    canActivateChild: [sesionGuard],
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./inicio/inicio.page').then((m) => m.InicioPage),
      },
      {
        path: 'retos',
        loadComponent: () => import('./retos/retos.page').then((m) => m.RetosPage),
      },
      {
        path: 'escanear',
        data: { titulo: 'Escanear' },
        loadComponent: () => import('./pendiente.page').then((m) => m.PendientePage),
      },
      {
        path: 'canjear',
        data: { titulo: 'Canjear' },
        loadComponent: () => import('./pendiente.page').then((m) => m.PendientePage),
      },
      {
        path: 'mas',
        loadComponent: () => import('./mas/mas.page').then((m) => m.MasPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  {
    path: 'sin-acceso',
    loadComponent: () => import('./avisos.pages').then((m) => m.SinAccesoPage),
  },
  {
    path: 'anulado',
    loadComponent: () => import('./avisos.pages').then((m) => m.AnuladoPage),
  },
  {
    path: 'sin-conexion',
    loadComponent: () => import('./avisos.pages').then((m) => m.SinConexionPage),
  },
  { path: '**', redirectTo: 'inicio' },
];
