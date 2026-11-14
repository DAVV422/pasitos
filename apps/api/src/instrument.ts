/**
 * Sentry (D58). Se importa antes que todo en main.ts.
 * Sin DSN (desarrollo), queda apagado. Nunca envía datos personales (T-005 §3):
 * Sentry no adjunta datos personales por defecto, y beforeSend borra lo que pueda quedar.
 */
import * as Sentry from '@sentry/nestjs';
import { limpiarEventoSentry } from './common/observabilidad/sentry-limpieza';

const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? 'desarrollo',
    release: process.env['VERSION'] ?? 'local',
    tracesSampleRate: 0.1,
    beforeSend: (evento) => limpiarEventoSentry(evento),
  });
}
