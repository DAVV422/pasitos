import { expect, test } from '@playwright/test';
import { createEmailPrueba, createPersona, seedEventoCerrado } from './apoyo/base';

/**
 * El reporte del evento (HU-402): la dueña lo ve desde el cierre, lo comparte y el enlace se abre
 * sin sesión; al dejar de compartir, el enlace responde 404. Solo en escritorio.
 */
test.beforeEach(({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
});

test('ver el reporte, compartirlo y abrir el enlace sin sesión', async ({ browser, page }) => {
  const email = createEmailPrueba('reporte');
  const password = 'una frase larga para el reporte';
  const nombre = `Feria cerrada ${Date.now()}`;
  await createPersona({ email, password, nombre: 'Dueña del reporte', dueno: true });
  const { eventoId, slug } = await seedEventoCerrado({ email }, nombre);

  // La dueña configura su segundo factor con una passkey virtual (como en acceso.spec.ts).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('/admin/entrar');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Usar una passkey (recomendado)' }).click();
  await page.getByRole('button', { name: 'Crear la passkey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mis eventos');

  await page.goto(`/admin/eventos/${eventoId}`);
  await page.getByTestId('ver-reporte').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reporte del evento');
  await expect(page.getByTestId('numeros')).toContainText('3');
  await expect(page.getByText('por privacidad se muestran solo los totales')).toBeVisible();
  await expect(page.getByText('Visita el stand de ejemplo')).toBeVisible();

  page.once('dialog', (dialogo) => void dialogo.accept());
  await page.getByRole('button', { name: 'Crear el enlace público' }).click();
  const enlace = (await page.getByTestId('enlace').textContent())?.trim() ?? '';
  expect(enlace).toMatch(/\/reporte\/[A-Za-z0-9_-]{43}$/);
  const camino = new URL(enlace).pathname;

  // Sin sesión: el reporte, sin los nombres de las personas.
  const anonimo = await browser.newContext();
  const visita = await anonimo.newPage();
  const respuesta = await visita.goto(camino);
  expect(respuesta?.status()).toBe(200);
  await expect(visita.getByRole('heading', { level: 1 })).toHaveText(nombre);
  await expect(visita.getByTestId('stellar')).toBeVisible();
  await expect(visita.getByText('Persona Inventada')).toHaveCount(0);

  // La página del evento lleva a Ver reporte.
  await visita.goto(`/eventos/${slug}`);
  await expect(visita.getByTestId('ver-reporte')).toHaveAttribute('href', camino);

  // Dejar de compartir: el enlace responde 404 (el API no guarda caché en local).
  await page.getByRole('button', { name: 'Dejar de compartir' }).click();
  await expect(page.getByRole('button', { name: 'Crear el enlace público' })).toBeVisible();
  const despues = await visita.request.get(`/api/v1/publico/reportes/${camino.split('/').at(-1)}`);
  expect(despues.status()).toBe(404);
  await anonimo.close();
});
