import { Route } from '@angular/router';
import { DocumentoLegalPage } from './documento-legal.page';
import { InicioPage } from './inicio.page';
import { NoEncontradoPage } from './no-encontrado.page';

/** Rutas del sitio público (Aplicaciones web §7). Cómo se arma cada una: `app.routes.server.ts`. */
export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Pasitos · Cada paso cuenta',
    component: InicioPage,
  },
  {
    path: 'terminos',
    title: 'Términos y condiciones · Pasitos',
    data: { tipo: 'terminos' },
    component: DocumentoLegalPage,
  },
  {
    path: 'privacidad',
    title: 'Política de privacidad · Pasitos',
    data: { tipo: 'privacidad' },
    component: DocumentoLegalPage,
  },
  {
    // HU-405: aparte del paquete inicial (el sitio tiene 80 KB).
    path: 'eventos',
    title: 'Eventos · Pasitos',
    loadComponent: () => import('./eventos/eventos.page').then((m) => m.EventosPage),
  },
  {
    // HU-406: la página pública de cada evento, también aparte del paquete inicial.
    path: 'eventos/:slug',
    loadComponent: () => import('./eventos/evento.page').then((m) => m.EventoPage),
  },
  {
    // HU-402: el reporte compartido con un enlace, aparte del paquete inicial.
    path: 'reporte/:token',
    title: 'Reporte del evento · Pasitos',
    loadComponent: () => import('./reporte/reporte.page').then((m) => m.ReportePage),
  },
  { path: '**', title: 'Página no encontrada · Pasitos', component: NoEncontradoPage },
];
