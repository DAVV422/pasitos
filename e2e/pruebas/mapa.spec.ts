import { devices, expect, test, type Page } from '@playwright/test';
import { createEmailPrueba, createIpPrueba, createPersona, seedEventoConPlano } from './apoyo/base';

/**
 * El mapa del evento (HU-414): la dueña marca un stand en el plano y la asistente lo encuentra en
 * la app, con su sponsor. Solo en escritorio (el celular se abre en su propio contexto).
 */
test.beforeEach(({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
});

/** Entra al panel con una passkey virtual (como en acceso.spec.ts). */
async function entrarComoDuena(page: Page, email: string, password: string): Promise<void> {
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
}

test('la dueña marca un stand en el plano y la asistente lo encuentra en la app', async ({
  browser,
  page,
}) => {
  const email = createEmailPrueba('mapa');
  const password = 'una frase larga para el mapa';
  await createPersona({ email, password, nombre: 'Dueña del mapa', dueno: true });
  const datos = await seedEventoConPlano({ email }, `Feria con mapa ${Date.now()}`);
  await entrarComoDuena(page, email, password);

  // Panel: marcar el stand a un cuarto del ancho y a la mitad del alto.
  await page.goto(`/admin/eventos/${datos.eventoId}/mapa`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mapa del evento');
  await page.getByRole('button', { name: `Marcar ${datos.stand}`, exact: true }).click();
  const plano = page.getByTestId('plano');
  const caja = await plano.boundingBox();
  if (!caja) throw new Error('No se ve el plano');
  await plano.click({ position: { x: caja.width * 0.25, y: caja.height * 0.5 } });
  await expect(page.getByText('En el plano', { exact: true })).toBeVisible();

  // App: la asistente entra con su invitación y toca el 7 en el plano.
  const contexto = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    extraHTTPHeaders: { 'X-Forwarded-For': createIpPrueba() },
  });
  const celular = await contexto.newPage();
  await celular.goto(`/app/acceso/invitacion/${datos.token}`);
  await celular.getByRole('button', { name: 'Entrar' }).click();
  await expect(celular).toHaveURL(/\/app\/inicio/);
  await celular.goto('/app/mapa');
  const marcador = celular.getByRole('button', { name: datos.stand, exact: true });
  await expect(marcador).toHaveText('7');
  await marcador.click();
  const ficha = celular.getByTestId('ficha-lugar');
  await expect(ficha).toContainText(`7 · ${datos.stand}`);
  await expect(ficha).toContainText(datos.sponsor);
  await contexto.close();
});
