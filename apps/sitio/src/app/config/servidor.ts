/**
 * Configuración del servidor del sitio (SSR). Solo se importa desde `app.config.server.ts`.
 * `API_INTERNO_URL`: dónde está el API visto desde el sitio. En el VPS, `http://api:3000` (la red
 * de Docker); en desarrollo y en las pruebas, el valor por defecto.
 */
export const API_INTERNO_URL = (process.env['API_INTERNO_URL'] ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
