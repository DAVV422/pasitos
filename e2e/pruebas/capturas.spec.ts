/**
 * Capturas de las pantallas del panel en escritorio (1280), tablet (768) y celular (390), para
 * revisar la UI antes y después de cada cambio (Fase 5 de UI). En cada captura corre axe: al final
 * falla si hay problemas graves de accesibilidad y los deja en `accesibilidad.json`. No es una
 * prueba de CI: solo corre con CAPTURAS_DIR.
 *
 *   SEGUNDO_FACTOR_ORGANIZACIONES=apagado node --env-file=.env dist/apps/api/main.js &
 *   CAPTURAS_DIR=capturas npx playwright test --config e2e/playwright.config.ts capturas --project escritorio
 */
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createEmailPrueba, createIpPrueba, createPersona } from './apoyo/base';

const DIR = process.env['CAPTURAS_DIR'];
const ANCHOS = [
  ['escritorio', 1280, 800],
  ['tablet', 768, 1024],
  ['celular', 390, 844],
] as const;

/** Problemas graves de accesibilidad: `captura (ancho) · regla: ayuda · elemento`. */
const graves: string[] = [];

async function revisarAccesibilidad(page: Page, captura: string) {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of resultado.violations) {
    if (!['serious', 'critical'].includes(v.impact ?? '')) continue;
    for (const nodo of v.nodes) {
      graves.push(`${captura} · ${v.id}: ${v.help} · ${nodo.target.join(' ')}`);
    }
  }
}

async function capturar(page: Page, nombre: string) {
  for (const [tipo, ancho, alto] of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/${nombre}-${tipo}.png`, fullPage: true });
    await revisarAccesibilidad(page, `${nombre}-${tipo}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** Solo lo que se ve, en escritorio: para revisar que el foco del teclado se nota. */
async function capturarFoco(page: Page, nombre: string) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${DIR}/${nombre}.png` });
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
  await page.getByLabel('Empieza').fill('10/03/2030 09:00');
  await page.getByLabel('Termina').fill('10/03/2030 18:00');
  await page.getByRole('button', { name: 'Crear el evento' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Encuentro Tech La Paz 2030');
  await capturar(page, '04-resumen');

  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
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

  // Teclado (Fase 5): las pestañas se recorren con las flechas y el interruptor muestra el foco.
  await page.getByRole('tab', { name: 'Reglas y puerta' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Visibilidad' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Visibilidad' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await capturarFoco(page, '24-foco-pestanas');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Reglas y puerta' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('switch', { name: /Registro de personas nuevas/ })).toBeFocused();
  await capturarFoco(page, '25-foco-interruptor');

  await page.getByRole('link', { name: 'Lugares', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar lugar' }).click();
  await capturar(page, '10-lugares-form');
  await page.getByLabel('Nombre', { exact: true }).fill('Auditorio principal');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Auditorio principal')).toBeVisible();
  await capturar(page, '11-lugares-lista');

  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: /Agregar/ }).click();
  await capturar(page, '12-agenda-form');
  // El formulario está en un panel lateral (modal): se cierra antes de ir a otra pantalla. El
  // foco vuelve al botón que lo abrió.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Agregar/ })).toBeFocused();

  await page.getByRole('link', { name: 'Retos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo reto' }).click();
  // Al abrir, el foco va al primer campo; con Mayús+Tab llega a la × y no sale del panel.
  await expect(page.getByLabel('Nombre')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: /Con QR/ })).toBeFocused();
  await capturarFoco(page, '26-foco-opcion');
  await capturar(page, '13-retos-form');
  await page.getByLabel('Nombre').fill('Charla de apertura');
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Auditorio principal' });
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/participaciones/)).toBeVisible();
  await capturar(page, '14-retos-lista');

  await page.getByRole('link', { name: 'Catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo premio' }).click();
  await capturar(page, '15-catalogo-form');
  await page.getByLabel('Nombre').fill('Taza Pasitos');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Taza Pasitos')).toBeVisible();
  await capturar(page, '16-catalogo-lista');

  await page.getByRole('link', { name: 'Pantallas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva pantalla' }).click();
  await page.getByLabel('Nombre').fill('Tablet Auditorio');
  await page.getByLabel('Lugar').selectOption({ label: 'Auditorio principal' });
  await page.getByLabel('PIN de los controles').fill('4821');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tablet Auditorio')).toBeVisible();
  await page.getByRole('button', { name: 'Conectar' }).click();
  await capturar(page, '17-pantallas-conectar');
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Invitados', exact: true }).click();
  for (const nombre of ['Valeria Quispe', 'Luis Mamani', 'Carla Rojas']) {
    await page.getByRole('button', { name: 'Agregar invitado' }).click();
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(`${nombre}: guardado.`)).toBeVisible();
  }
  await capturar(page, '18-invitados');
  // El menú Más con el teclado: abre en la primera acción, se mueve con las flechas y Escape
  // lo cierra devolviendo el foco. (Enviar invitaciones está deshabilitado: nadie tiene correo.)
  const mas = page.getByRole('button', { name: 'Más' });
  await mas.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Importar CSV' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeFocused();
  await capturarFoco(page, '27-foco-menu');
  await page.keyboard.press('Escape');
  await expect(mas).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await capturar(page, '19-invitados-importar');

  await page.getByRole('link', { name: 'Equipo', exact: true }).click();
  await page.getByRole('button', { name: 'Invitar' }).click();
  await capturar(page, '20-equipo-invitar');
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Bitácora', exact: true }).click();
  await capturar(page, '21-bitacora');

  await page.goto('/admin/cuenta');
  await capturar(page, '22-mi-cuenta');

  // El menú del celular, abierto (Fase 2).
  await page.goBack();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menú' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/23-menu-abierto-celular.png` });
  await revisarAccesibilidad(page, '23-menu-abierto-celular');

  writeFileSync(`${DIR}/accesibilidad.json`, JSON.stringify(graves, null, 2));
  expect(graves).toEqual([]);
});
