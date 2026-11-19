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
  { path: '**', title: 'Página no encontrada · Pasitos', component: NoEncontradoPage },
];
