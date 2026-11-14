import { Route } from '@angular/router';

declare const ngDevMode: boolean | undefined;

/**
 * Rutas del panel. `/_ui` es el catálogo del design system (T-004 §6): solo existe en
 * desarrollo; en el build de producción `ngDevMode` es false y la rama se elimina.
 */
export const appRoutes: Route[] = [
  ...(typeof ngDevMode !== 'undefined' && ngDevMode
    ? [
        {
          path: '_ui',
          loadComponent: () =>
            import('./catalogo-ui/catalogo-ui.page').then((modulo) => modulo.CatalogoUiPage),
        },
      ]
    : []),
];
