import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { getDocumentoLegal } from '@pasitos/dominio/legal';
import { appConfig } from './app.config';
import { API_INTERNO_URL } from './config/servidor';
import { FUENTE_EVENTO, fetchEvento } from './eventos/fuente-evento';
import { FUENTE_EVENTOS, fetchEventos } from './eventos/fuente-eventos';
import { FUENTE_LEGAL } from './fuente-legal';
import { FUENTE_REPORTE, fetchReporte } from './reporte/fuente-reporte';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Solo en el servidor: el navegador recibe el texto en el estado transferido.
    { provide: FUENTE_LEGAL, useValue: getDocumentoLegal },
    // HU-405: los eventos, pedidos al API por la red interna.
    {
      provide: FUENTE_EVENTOS,
      useValue: (momento: Parameters<typeof fetchEventos>[1], cursor: string | null) =>
        fetchEventos(API_INTERNO_URL, momento, cursor),
    },
    // HU-406: la página de cada evento.
    { provide: FUENTE_EVENTO, useValue: (slug: string) => fetchEvento(API_INTERNO_URL, slug) },
    // HU-402: el reporte compartido.
    {
      provide: FUENTE_REPORTE,
      useValue: (token: string) => fetchReporte(API_INTERNO_URL, token),
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
