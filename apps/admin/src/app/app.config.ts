import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { APP_EQUIPO, sesionInterceptor } from '@pasitos/panel';
import { provideWebCore } from '@pasitos/web-core';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideWebCore([sesionInterceptor]),
    { provide: APP_EQUIPO, useValue: 'admin' },
  ],
};
