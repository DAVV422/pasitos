import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withNoHttpTransferCache,
} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Sin caché de HTTP: el sitio no le pide nada al API (todo llega prerenderizado).
    provideClientHydration(withEventReplay(), withNoHttpTransferCache()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
  ],
};
