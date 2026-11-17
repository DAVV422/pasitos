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
  // Sesiones, tokens y la consola de plataforma: tablas globales y búsquedas entre
  // organizaciones (ajuste 13 de la fase 2). Solo lo inyectan los módulos auth y plataforma.
  DATABASE_URL_SISTEMA: z.string().url(),
  // 32 bytes en base64 (`base64` o `version:base64`). Cifra el secreto de TOTP y los enlaces de
  // invitación (HU-201 §6). Las anteriores, para leer lo cifrado antes de rotarla.
  LLAVE_CIFRADO_DATOS: z.string().min(40),
  LLAVES_CIFRADO_ANTERIORES: z.string().default(''),
  // Origen de las apps: los enlaces de los correos y el origen de WebAuthn.
  PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  WEBAUTHN_RP_ID: z.string().min(1).default('localhost'),
  // Segundo factor de las organizaciones (dueños, coorganizadores y su equipo). `apagado` (solo para
  // la demo): entran con la contraseña; los administradores de plataforma lo siguen necesitando.
  // Los métodos ya configurados se conservan y vuelven a pedirse al encenderlo.
  SEGUNDO_FACTOR_ORGANIZACIONES: z.enum(['obligatorio', 'apagado']).default('obligatorio'),
  WEBAUTHN_RP_NAME: z.string().min(1).default('Pasitos'),
  // Have I Been Pwned (k-anonimato). Apagado en los tests y el CI.
  HIBP_ACTIVO: z
    .enum(['true', 'false'])
    .default('true')
    .transform((valor) => valor === 'true'),
  // Cuántos proxies hay delante del API: se confía solo en esos saltos de X-Forwarded-For, para
  // que nadie elija su IP y se salte el límite por IP. Local: 1 (tools/servidor-local.mjs).
  // Producción: Cloudflare + Caddy (T-002).
  TRUST_PROXY_SALTOS: z.coerce.number().int().min(0).max(5).default(1),
  // Volumen de archivos (HU-214): cuarentena/ y eventos/<org>/<evento>/<id>/. En el VPS, /srv/pasitos/archivos.
  ARCHIVOS_DIR: z.string().min(1).default('.archivos'),
  // Static Maps (restringida por IP). Sin llave, la ubicación se guarda sin mapa.
  GOOGLE_MAPS_LLAVE_SERVIDOR: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Solo para el enlace al explorador (stellar.expert); el API no habla con Stellar.
  STELLAR_RED: z.enum(['local', 'testnet']).default('local'),
  CORREO_TOPE_DIARIO: z.coerce.number().int().min(1).default(80),
  CORREO_RESERVA_SEGURIDAD: z.coerce.number().int().min(0).default(10),
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
