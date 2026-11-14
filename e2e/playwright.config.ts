import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de punta a punta (T-009). Corren contra el mismo esquema de rutas que producción
 * (tools/servidor-local.mjs hace de Caddy). Requiere: base levantada y migrada, y las apps compiladas.
 *
 *   pnpm db:levantar && pnpm db:migrar && pnpm semilla demo
 *   pnpm build
 *   pnpm e2e
 */
const BASE = process.env['E2E_BASE_URL'] ?? 'http://localhost:8080';
const enCi = !!process.env['CI'];

export default defineConfig({
  testDir: './pruebas',
  fullyParallel: true,
  forbidOnly: enCi,
  retries: enCi ? 1 : 0,
  reporter: enCi ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node --env-file=../.env ../dist/apps/api/main.js',
      url: 'http://127.0.0.1:3000/api/v1/salud',
      reuseExistingServer: !enCi,
      timeout: 60_000,
    },
    {
      command: 'node ../dist/apps/sitio/server/server.mjs',
      url: 'http://127.0.0.1:4000/',
      env: { PORT: '4000' },
      reuseExistingServer: !enCi,
      timeout: 60_000,
    },
    {
      command: 'node ../tools/servidor-local.mjs',
      url: `${BASE}/app/`,
      reuseExistingServer: !enCi,
      timeout: 30_000,
    },
  ],
});
