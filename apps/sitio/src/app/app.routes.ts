import { Route } from '@angular/router';
import { DocumentoLegalPage } from './documento-legal.page';
import { InicioPage } from './inicio.page';

/** Rutas del sitio público (Aplicaciones web §7). Todas se prerenderizan. */
export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Pasitos',
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
];
