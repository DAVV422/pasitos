import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { getDocumentoLegal } from '@pasitos/dominio/legal';
import { appConfig } from './app.config';
import { FUENTE_LEGAL } from './fuente-legal';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Solo en el servidor: el navegador recibe el texto en el estado transferido.
    { provide: FUENTE_LEGAL, useValue: getDocumentoLegal },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
