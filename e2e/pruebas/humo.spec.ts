import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Flujo de humo de la fase 0 (T-009 §3): cada app carga en su ruta, en tema claro,
 * sin errores en la consola y sin problemas graves de accesibilidad.
 */
const APPS = [
  { ruta: '/', titulo: 'Cada paso cuenta.' },
  { ruta: '/app/', titulo: 'Tu entrada a Pasitos' },
  { ruta: '/sala/', titulo: 'Pantalla de sala' },
  { ruta: '/mesa/', titulo: 'Mesa de canje' },
  { ruta: '/admin/', titulo: 'Panel del organizador' },
  { ruta: '/plataforma/', titulo: 'Consola de plataforma' },
];

function capturarErrores(pagina: Page): string[] {
  const errores: string[] = [];
  pagina.on('pageerror', (error) => errores.push(error.message));
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error') errores.push(mensaje.text());
  });
  return errores;
}

for (const { ruta, titulo } of APPS) {
  test(`${ruta} carga en tema claro, sin errores y accesible`, async ({ page }) => {
    const errores = capturarErrores(page);
    await page.goto(ruta);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titulo);
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByText('Testnet')).toBeVisible();

    const accesibilidad = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const graves = accesibilidad.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(graves.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    expect(errores).toEqual([]);
  });
}

test('una ruta interna de una app vuelve a su index.html (fallback)', async ({ page }) => {
  await page.goto('/app/inicio');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu entrada a Pasitos');
});

test('el API responde la salud con la base conectada', async ({ request }) => {
  const respuesta = await request.get('/api/v1/salud');
  expect(respuesta.status()).toBe(200);
  expect(await respuesta.json()).toMatchObject({ estado: 'ok', base: 'ok' });
  expect(respuesta.headers()['x-request-id']).toBeTruthy();
});

test('los errores del API vienen en formato Problem Details', async ({ request }) => {
  const respuesta = await request.get('/api/v1/no-existe');
  expect(respuesta.status()).toBe(404);
  expect(respuesta.headers()['content-type']).toContain('application/problem+json');
  expect(await respuesta.json()).toMatchObject({ code: 'NO_ENCONTRADO' });
});
