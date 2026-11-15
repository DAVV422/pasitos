import { expect, test, type Page } from '@playwright/test';
import { createEmailPrueba, createPersona, getEnlaceCorreo } from './apoyo/base';

/**
 * Acceso del equipo de punta a punta (HU-201): passkey con el autenticador virtual de Chrome y
 * recuperar la contraseña con el enlace del correo. Solo en el proyecto de escritorio: el límite
 * de 5 intentos por minuto por IP vale para todo el navegador de pruebas.
 */
const PASSWORD = 'una frase larga para e2e';

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
});

async function entrar(page: Page, app: string, email: string, password: string): Promise<void> {
  await page.goto(`/${app}/entrar`);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('la dueña configura una passkey al entrar y después entra con ella', async ({ page }) => {
  const email = createEmailPrueba('passkey');
  await createPersona({ email, password: PASSWORD, nombre: 'Duena e2e', dueno: true });

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

  await entrar(page, 'admin', email, PASSWORD);
  await expect(page).toHaveURL(/\/admin\/segundo-factor\/configurar/);
  // Es obligatorio: no hay "Ahora no".
  await expect(page.getByRole('button', { name: 'Ahora no' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar una passkey (recomendado)' }).click();
  await page.getByRole('button', { name: 'Crear la passkey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Panel del organizador');
  await expect(page.getByText('Hola, Duena e2e.')).toBeVisible();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/admin\/entrar/);
  await entrar(page, 'admin', email, PASSWORD);
  await expect(page).toHaveURL(/\/admin\/segundo-factor$/);
  await page.getByRole('button', { name: 'Usar mi passkey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Panel del organizador');

  await page.getByRole('link', { name: 'Mi cuenta' }).click();
  await expect(page.getByText(/Passkey de Chrome/)).toBeVisible();
  await expect(page.getByText('· esta')).toBeVisible();
});

test('recupera la contraseña con el enlace del correo y entra con la nueva', async ({ page }) => {
  const email = createEmailPrueba('recuperar');
  await createPersona({ email, password: PASSWORD, nombre: 'Registrador e2e' });

  await page.goto('/admin/entrar');
  await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviar el enlace' }).click();
  await expect(page.getByText('Si el correo está registrado, te llegará un enlace')).toBeVisible();

  const ruta = new URL(await getEnlaceCorreo(email, 'restablecer_password')).pathname;
  await page.goto(ruta);
  await page.getByLabel('Contraseña nueva').fill('pasitos2026');
  await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
  await expect(page.getByText('Es una de las contraseñas más usadas')).toBeVisible();

  const nueva = 'otra frase nueva para e2e';
  await page.getByLabel('Contraseña nueva').fill(nueva);
  await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
  await expect(page.getByText('Listo: cambiaste tu contraseña')).toBeVisible();

  // El mismo enlace ya no sirve (V15).
  await page.goto(ruta);
  await page.getByLabel('Contraseña nueva').fill('una tercera frase larga');
  await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
  await expect(page.getByText('Este enlace ya no sirve')).toBeVisible();

  await entrar(page, 'admin', email, nueva);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Panel del organizador');
});

test('con la contraseña mal, el mismo error para todos', async ({ page }) => {
  await entrar(page, 'plataforma', createEmailPrueba('nadie'), 'cualquier cosa larga');
  await expect(page.getByText('El correo o la contraseña no son correctos.')).toBeVisible();
});
