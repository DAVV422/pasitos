/**
 * Capturas de las pantallas del panel en escritorio (1280) y celular (390), para revisar la UI
 * antes y después de cada cambio. No es una prueba: solo corre con CAPTURAS_DIR.
 *
 *   SEGUNDO_FACTOR_ORGANIZACIONES=apagado node --env-file=.env dist/apps/api/main.js &
 *   CAPTURAS_DIR=capturas npx playwright test --config e2e/playwright.config.ts capturas --project escritorio
 */
import { expect, test, type Page } from '@playwright/test';
import { createEmailPrueba, createIpPrueba, createPersona } from './apoyo/base';

const DIR = process.env['CAPTURAS_DIR'];
const ANCHOS = [
  ['escritorio', 1280, 800],
  ['celular', 390, 844],
] as const;

async function capturar(page: Page, nombre: string) {
  for (const [tipo, ancho, alto] of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/${nombre}-${tipo}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test('capturas del panel', async ({ page }, testInfo) => {
  test.skip(!DIR || testInfo.project.name !== 'escritorio');
  test.setTimeout(240_000);
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
  const email = createEmailPrueba('capturas');
  const password = 'una frase larga para capturas';
  await createPersona({ email, password, nombre: 'Daniela Prueba', dueno: true });

  await page.goto('/admin/entrar');
  await capturar(page, '01-entrar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mis eventos');
  await capturar(page, '02-mis-eventos-vacio');

  await page.getByRole('button', { name: 'Crear evento' }).click();
  await capturar(page, '03-crear-evento');
  await page.getByLabel('Nombre del evento').fill('Encuentro Tech La Paz 2030');
  await page.getByLabel('Empieza').fill('2030-03-10T09:00');
  await page.getByLabel('Termina').fill('2030-03-10T18:00');
  await page.getByRole('button', { name: 'Crear el evento' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Encuentro Tech La Paz 2030');
  await capturar(page, '04-resumen');

  await page.getByRole('link', { name: 'Configuración' }).click();
  await capturar(page, '05-configuracion-datos');
  for (const [tab, n] of [
    ['Imágenes', '06'],
    ['Ubicación', '07'],
    ['Visibilidad', '08'],
    ['Reglas y puerta', '09'],
  ] as const) {
    await page.getByRole('tab', { name: tab }).click();
    await capturar(page, `${n}-configuracion-${tab.split(' ')[0]!.toLowerCase()}`);
  }

  await page.getByRole('link', { name: 'Lugares' }).click();
  await page.getByRole('button', { name: 'Agregar lugar' }).click();
  await capturar(page, '10-lugares-form');
  await page.getByLabel('Nombre', { exact: true }).fill('Auditorio principal');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Auditorio principal')).toBeVisible();
  await capturar(page, '11-lugares-lista');

  await page.getByRole('link', { name: 'Agenda' }).click();
  await page.getByRole('button', { name: /Agregar/ }).click();
  await capturar(page, '12-agenda-form');

  await page.getByRole('link', { name: 'Retos' }).click();
  await page.getByRole('button', { name: 'Nuevo reto' }).click();
  await capturar(page, '13-retos-form');
  await page.getByLabel('Nombre').fill('Charla de apertura');
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Auditorio principal' });
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/participaciones/)).toBeVisible();
  await capturar(page, '14-retos-lista');

  await page.getByRole('link', { name: 'Catálogo' }).click();
  await page.getByRole('button', { name: 'Nuevo premio' }).click();
  await capturar(page, '15-catalogo-form');
  await page.getByLabel('Nombre').fill('Taza Pasitos');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Taza Pasitos')).toBeVisible();
  await capturar(page, '16-catalogo-lista');

  await page.getByRole('link', { name: 'Pantallas' }).click();
  await page.getByRole('button', { name: 'Nueva pantalla' }).click();
  await page.getByLabel('Nombre').fill('Tablet Auditorio');
  await page.getByLabel('Lugar').selectOption({ label: 'Auditorio principal' });
  await page.getByLabel('PIN de los controles').fill('4821');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tablet Auditorio')).toBeVisible();
  await page.getByRole('button', { name: 'Conectar' }).click();
  await capturar(page, '17-pantallas-conectar');

  await page.getByRole('link', { name: 'Invitados' }).click();
  for (const nombre of ['Valeria Quispe', 'Luis Mamani', 'Carla Rojas']) {
    await page.getByRole('button', { name: 'Agregar invitado' }).click();
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(`${nombre}: guardado.`)).toBeVisible();
  }
  await capturar(page, '18-invitados');
  await page.getByRole('button', { name: 'Importar CSV' }).click();
  await capturar(page, '19-invitados-importar');

  await page.getByRole('link', { name: 'Equipo' }).click();
  await page.getByRole('button', { name: 'Invitar' }).click();
  await capturar(page, '20-equipo-invitar');

  await page.getByRole('link', { name: 'Bitácora' }).click();
  await capturar(page, '21-bitacora');

  await page.goto('/admin/cuenta');
  await capturar(page, '22-mi-cuenta');
});
