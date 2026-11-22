import { expect, test, type Page } from '@playwright/test';
import { createEmailPrueba, createPersona, seedEventoParaAjustes } from './apoyo/base';

/**
 * Ajustes (HU-412): la dueña da por cumplido un reto de foto y canjea un premio a mano para una
 * asistente que no puede usar su celular. Solo en escritorio.
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

test('dar por cumplido un reto de foto y canjear un premio a mano', async ({ page }) => {
  const email = createEmailPrueba('ajustes');
  const password = 'una frase larga para los ajustes';
  await createPersona({ email, password, nombre: 'Dueña de ajustes', dueno: true });
  const datos = await seedEventoParaAjustes({ email }, `Feria de ajustes ${Date.now()}`);
  await entrarComoDuena(page, email, password);

  await page.goto(`/admin/eventos/${datos.eventoId}/ajustes`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes');

  // Dar por cumplido el reto de foto: pide el motivo.
  await page.getByRole('tab', { name: 'Dar por cumplido un reto' }).click();
  await page.getByLabel('Reto', { exact: true }).selectOption({ label: `${datos.reto} · +20` });
  await page.getByLabel('Códigos de asistente').fill(datos.codigo);
  const otorgar = page.getByRole('button', { name: 'Otorgar a 1' });
  await expect(otorgar).toBeDisabled();
  await page.getByTestId('motivo-reto').fill('No le funcionó la cámara; la sacó frente al equipo.');
  await otorgar.click();
  await expect(page.getByText('Otorgado', { exact: true })).toBeVisible();

  // Canjear un premio a mano: 100 + 20 = 120, menos 2 × 30.
  await page.getByRole('tab', { name: 'Canjear un premio' }).click();
  await page.getByLabel('Persona').fill('Paula');
  await page.getByRole('button', { name: new RegExp(datos.asistente) }).click();
  await page.getByRole('button', { name: `Agregar ${datos.premio}` }).click();
  await page.getByRole('button', { name: `Agregar ${datos.premio}` }).click();
  await page.getByTestId('motivo-canje').fill('Se le apagó el celular en la mesa.');
  await page.getByTestId('canjear-manual').click();
  const hecho = page.getByTestId('canje-hecho');
  await expect(hecho).toContainText(/C-\d{4}/);
  await expect(hecho).toContainText(`2 × ${datos.premio}`);
  await expect(hecho).toContainText('Le quedan 60 pts');
});
