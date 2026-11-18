import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { firmaInterceptor, provideWebCore } from '@pasitos/web-core';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    // HU-306 §4: las operaciones que mueven puntos van firmadas con la llave del navegador.
    provideWebCore([firmaInterceptor]),
    // HU-309 §3: abre sin red. `/app/estado` y lo que mueve puntos nunca pasan por la caché del
    // service worker (no están en `ngsw-config.json`). Una versión nueva se aplica al volver a
    // abrir la app, nunca a mitad de un canje (no se llama a `activateUpdate`).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
