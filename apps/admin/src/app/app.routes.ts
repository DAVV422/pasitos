import { Route } from '@angular/router';
import { RUTAS_ACCESO, sesionGuard } from '@pasitos/panel';

declare const ngDevMode: boolean | undefined;

/**
 * Rutas del panel. El acceso (HU-201) viene de libs/panel. `/_ui` es el catálogo del design system (T-004 §6): solo existe en
 * desarrollo; en el build de producción `ngDevMode` es false y la rama se elimina.
 */
export const appRoutes: Route[] = [
  ...RUTAS_ACCESO,
  {
    path: '',
    pathMatch: 'full',
    canActivate: [sesionGuard],
    title: 'Panel · Pasitos',
    loadComponent: () => import('./inicio/inicio.page').then((m) => m.InicioPage),
  },
  ...(typeof ngDevMode !== 'undefined' && ngDevMode
    ? [
        {
          path: '_ui',
          loadComponent: () =>
            import('./catalogo-ui/catalogo-ui.page').then((modulo) => modulo.CatalogoUiPage),
        },
      ]
    : []),
  { path: '**', redirectTo: '' },
];
