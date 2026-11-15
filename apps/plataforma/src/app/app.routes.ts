import { Route } from '@angular/router';
import { RUTAS_ACCESO, sesionGuard } from '@pasitos/panel';

/** Rutas de la consola. El acceso (HU-201) viene de libs/panel; la consola llega con HU-202. */
export const appRoutes: Route[] = [
  ...RUTAS_ACCESO,
  {
    path: '',
    pathMatch: 'full',
    canActivate: [sesionGuard],
    title: 'Consola · Pasitos',
    loadComponent: () => import('./inicio/inicio.page').then((m) => m.InicioPage),
  },
  { path: '**', redirectTo: '' },
];
