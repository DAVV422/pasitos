import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { firmaInterceptor, provideWebCore } from '@pasitos/web-core';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    // HU-306 §4: las operaciones que mueven puntos van firmadas con la llave del navegador.
    provideWebCore([firmaInterceptor]),
  ],
};
