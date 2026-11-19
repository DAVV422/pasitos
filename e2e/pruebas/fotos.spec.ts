import { devices, expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  createEmailPrueba,
  createIpPrueba,
  createPersona,
  processFotos,
  seedEventoConFoto,
} from './apoyo/base';

/**
 * Las fotos de los retos de punta a punta (HU-322 a HU-324): la persona manda una foto desde el
 * celular, el responsable del reto la rechaza, la persona la vuelve a mandar y el responsable la
 * aprueba; los puntos llegan a la app, la foto aparece en *Mis fotos* y la persona retira la
 * autorización. Solo en el proyecto de escritorio: el celular se emula en un contexto propio.
 */
const PASSWORD = 'una frase larga para las fotos';

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
});

/** Una imagen distinta en cada intento (el dHash de dos iguales daría *repetida*). */
function createFoto(semilla: number): Promise<Buffer> {
  const ancho = 640;
  const alto = 480;
  const pixeles = Buffer.alloc(ancho * alto * 3);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 3;
      pixeles[i] = (x * semilla) % 256;
      pixeles[i + 1] = (y * (semilla + 3)) % 256;
      pixeles[i + 2] = ((x + y) * 7 * semilla) % 256;
    }
  }
  return sharp(pixeles, { raw: { width: ancho, height: alto, channels: 3 } })
    .jpeg()
    .toBuffer();
}

async function sendFoto(celular: Page, retoId: string, semilla: number): Promise<void> {
  await celular.goto(`/app/retos/${retoId}`);
  const selector = celular.waitForEvent('filechooser');
  await celular.getByRole('button', { name: 'Subir de la galería' }).click();
  await (
    await selector
  ).setFiles({
    name: `foto-${semilla}.jpg`,
    mimeType: 'image/jpeg',
    buffer: await createFoto(semilla),
  });
  await celular.getByRole('checkbox').check();
  await celular.getByRole('button', { name: 'Enviar' }).click();
  await expect(celular.getByRole('status').filter({ hasText: 'En revisión' })).toBeVisible({
    timeout: 30_000,
  });
}

test('mandar, rechazar, reenviar, aprobar y retirar la autorización', async ({ browser, page }) => {
  test.setTimeout(180_000);
  const email = createEmailPrueba('responsable-fotos');
  await createPersona({ email, password: PASSWORD, nombre: 'Responsable fotos e2e' });
  const evento = await seedEventoConFoto({ email });
  const ip = createIpPrueba();
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });

  // El celular de la persona: entra con su invitación.
  const contexto = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    extraHTTPHeaders: { 'X-Forwarded-For': ip },
  });
  const celular = await contexto.newPage();
  await celular.goto(`/app/acceso/invitacion/${evento.token}`);
  await celular.getByRole('button', { name: 'Entrar' }).click();
  await expect(celular).toHaveURL(/\/app\/inicio/);

  // 1. Manda la primera foto; el trabajador la procesa.
  await sendFoto(celular, evento.retoId, 1);
  processFotos();

  // 2. El responsable del reto la rechaza.
  await page.goto('/admin/entrar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mis eventos');
  await page.goto(`/admin/eventos/${evento.eventoId}/fotos/revisar`);
  await expect(page.getByTestId('nombre')).toHaveText('Valeria Quispe');
  await page.getByRole('button', { name: 'Rechazar ▾' }).click();
  await page.getByRole('button', { name: 'No se ve bien' }).click();
  await expect(page.getByText('No hay fotos por revisar')).toBeVisible();

  // 3. La persona ve el rechazo y la vuelve a mandar.
  await celular.goto(`/app/retos/${evento.retoId}`);
  await expect(celular.getByText('Rechazada: No se ve bien')).toBeVisible();
  await expect(celular.getByText('Te quedan 2 intentos')).toBeVisible();
  await sendFoto(celular, evento.retoId, 5);
  processFotos();

  // 4. El responsable la aprueba: es el 2.º intento.
  await page.goto(`/admin/eventos/${evento.eventoId}/fotos/revisar`);
  await expect(page.getByText('2.º intento')).toBeVisible();
  await page.getByRole('button', { name: '✓ Aprobar' }).click();
  await expect(page.getByText('No hay fotos por revisar')).toBeVisible();

  // En *Fotos* quedan las dos, con quién las revisó.
  await page.goto(`/admin/eventos/${evento.eventoId}/fotos`);
  await expect(page.getByTestId('fotos').getByRole('listitem')).toHaveCount(2);
  const aprobada = page.getByTestId('fotos').getByRole('listitem').first();
  await expect(aprobada).toContainText('2.º intento');
  await expect(aprobada).toContainText('Aprobada');
  await expect(aprobada).toContainText('Responsable F.');

  // 5. Los puntos llegan a la app.
  await celular.goto(`/app/retos/${evento.retoId}`);
  await expect(celular.getByText('¡Aprobada! +20')).toBeVisible();

  // 6. *Mis fotos*: retira la autorización.
  await celular.goto('/app/cuenta/fotos');
  const misFotos = celular.getByTestId('mis-fotos');
  await expect(misFotos.getByRole('listitem')).toHaveCount(2);
  celular.once('dialog', (dialogo) => void dialogo.accept());
  await misFotos.getByRole('button', { name: 'Retirar autorización' }).first().click();
  await expect(celular.getByText('Retiramos tu autorización.')).toBeVisible();
  await expect(misFotos.getByRole('button', { name: 'Retirar autorización' })).toHaveCount(1);

  await contexto.close();
});
