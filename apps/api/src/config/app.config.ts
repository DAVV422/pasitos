import { z } from 'zod';

/**
 * Variables de entorno del API, validadas al arrancar (Backend §6).
 * Si falta una o es inválida, el proceso no arranca.
 */
const esquemaConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL_APP: z.string().url(),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  SENTRY_ENVIRONMENT: z.string().default('desarrollo'),
  VERSION: z.string().default('local'),
});

export type AppConfig = z.infer<typeof esquemaConfig>;

export function loadAppConfig(entorno: NodeJS.ProcessEnv = process.env): AppConfig {
  const resultado = esquemaConfig.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `${problema.path.join('.')}: ${problema.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${problemas}`);
  }
  return resultado.data;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
