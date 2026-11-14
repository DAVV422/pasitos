import type { ErrorEvent } from '@sentry/nestjs';

/** Rutas cuyo último tramo es un token de acceso: se reemplaza por [token] (T-005 §3). */
const RUTAS_CON_TOKEN = [
  /(\/app\/acceso\/[^/]+\/)[^/?#]+/g,
  /(\/acceso\/[^/]+\/)[^/?#]+/g,
  /(\/v\/)[^/?#]+/g,
  /(\/r\/)[^/?#]+/g,
  /(\/auth\/invitaciones\/)[^/?#]+/g,
  /(\/app\/cobros\/)[^/?#]+/g,
];

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function limpiarUrl(url: string): string {
  let limpia = url;
  for (const patron of RUTAS_CON_TOKEN) {
    limpia = limpia.replace(patron, '$1[token]');
  }
  return limpia.replace(CORREO, '[correo]');
}

/** Quita lo que pueda identificar a una persona antes de enviar el evento a Sentry. */
export function limpiarEventoSentry(evento: ErrorEvent): ErrorEvent {
  delete evento.user;
  if (evento.request) {
    delete evento.request.cookies;
    delete evento.request.data;
    delete evento.request.headers;
    if (evento.request.url) {
      evento.request.url = limpiarUrl(evento.request.url);
    }
    delete evento.request.query_string;
  }
  if (evento.message) {
    evento.message = evento.message.replace(CORREO, '[correo]');
  }
  return evento;
}
