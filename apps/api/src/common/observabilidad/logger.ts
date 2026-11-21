import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app.config';

/** Campos que nunca se escriben en los logs (Backend §5, T-005 §1). */
export const CAMPOS_OCULTOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.remoteAddress',
  'req.remotePort',
  'res.headers["set-cookie"]',
  '*.email',
  '*.celular',
  '*.nombre',
  '*.password',
  '*.token',
  '*.ip',
  '*.cookie',
  '*.authorization',
  '*.llavePublica',
];

/** `destino`: en los tests, para leer lo que se escribe (HU-201: ni contraseñas ni tokens). */
export function buildLoggerParams(config: AppConfig, destino?: NodeJS.WritableStream): Params {
  const opciones = {
    level: config.LOG_LEVEL,
    // El id lo genera Fastify (main.ts); pino-http lo reutiliza como traceId.
    genReqId: (request) => (request as unknown as { id: string }).id,
    customProps: (request) => ({ traceId: (request as unknown as { id: string }).id }),
    redact: { paths: CAMPOS_OCULTOS, censor: '[Redacted]' },
    serializers: {
      req: (request: { method: string; url: string }) => ({
        method: request.method,
        url: request.url.split('?')[0],
      }),
    },
    ...(config.NODE_ENV === 'development' && !destino
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  } satisfies Params['pinoHttp'];
  return { pinoHttp: destino ? [opciones, destino] : opciones };
}
