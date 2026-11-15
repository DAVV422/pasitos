import { expect, test, type Page } from '@playwright/test';
import { createEmailPrueba, createIpPrueba, createPersona, getEnlaceCorreo } from './apoyo/base';

/**
 * Consola de plataforma de punta a punta (HU-202): un administrador entra con passkey, crea una
 * organización y la dueña acepta la invitación, crea su cuenta y configura su segundo factor.
 * Solo en escritorio (Chromium, por el autenticador virtual).
 */
test.beforeEach(async ({ browserName, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
  // Cada test con su IP: el límite de 5 intentos por minuto es por IP y los tests corren juntos.
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
});

/** Un PNG de 1 × 1 válido, para la subida (HU-214). */
const LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function addAutenticadorVirtual(page: Page): Promise<void> {
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
}

async function createPasskey(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Usar una passkey (recomendado)' }).click();
  await page.getByRole('button', { name: 'Crear la passkey' }).click();
}

test('un administrador crea una organización y la dueña acepta la invitación', async ({
  page,
  browser,
}) => {
  const adminEmail = createEmailPrueba('admin-consola');
  const password = 'una frase larga para la consola';
  await createPersona({ email: adminEmail, password, nombre: 'Admin e2e', rolPlataforma: 'admin' });
  await addAutenticadorVirtual(page);

  await page.goto('/plataforma/entrar');
  await page.getByLabel('Correo').fill(adminEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await createPasskey(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organizaciones');

  const duenaEmail = createEmailPrueba('duena-org');
  await page.getByRole('button', { name: 'Nueva organización' }).click();
  await page.getByLabel('Nombre de la organización').fill('Comunidad e2e');
  await page.getByLabel('Nombre de la dueña o el dueño').fill('Duena Org e2e');
  await page.getByLabel('Su correo').fill(duenaEmail);
  await page.getByRole('button', { name: 'Crear e invitar' }).click();
  await expect(page.getByText(`enviamos la invitación a ${duenaEmail}`)).toBeVisible();

  const enlace = await getEnlaceCorreo(duenaEmail, 'invitacion_organizacion');
  await page.goto(new URL(enlace).pathname);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('te invitó como dueño');
  await page.getByLabel('Tu nombre').fill('Duena Org e2e');
  await page.getByLabel('Elige tu contraseña').fill('la frase de la duena e2e');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear mi cuenta y aceptar' }).click();

  // Es dueña de una organización: el segundo factor es obligatorio.
  await expect(page).toHaveURL(/\/admin\/segundo-factor\/configurar/);
  await createPasskey(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mis eventos');
  // Es dueña de una organización: puede crear su primer evento.
  await expect(page.getByRole('button', { name: 'Crear evento' })).toBeVisible();

  // HU-205: crea su evento en borrador y la lista de chequeo dice qué falta para publicar.
  await page.getByRole('button', { name: 'Crear evento' }).click();
  await page.getByLabel('Nombre del evento').fill('Encuentro e2e');
  await page.getByLabel('Empieza').fill('2030-03-10T09:00');
  await page.getByLabel('Termina').fill('2030-03-10T18:00');
  await page.getByRole('button', { name: 'Crear el evento' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Encuentro e2e');
  await expect(page.getByText('Crea al menos un reto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  await page.getByRole('link', { name: 'Bitácora' }).click();
  await expect(page.getByText('Creó el evento')).toBeVisible();

  // HU-206 y HU-214: configura el evento, sube el logo y crea un lugar.
  await page.getByRole('link', { name: 'Configuración' }).click();
  await page.getByLabel('Descripción').fill('Un encuentro para probar Pasitos.');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await page.getByRole('tab', { name: 'Imágenes' }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO_PNG });
  await expect(page.getByRole('img', { name: 'Vista previa: Logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar la imagen' })).toBeVisible();
  await page.getByRole('link', { name: 'Lugares' }).click();
  await page.getByRole('button', { name: 'Agregar lugar' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Auditorio principal');
  await page.getByLabel('Número en el plano').fill('1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Auditorio principal')).toBeVisible();

  // HU-207: crea un reto de QR en ese lugar; la lista de chequeo pide ahora su pantalla.
  await page.getByRole('link', { name: 'Retos' }).click();
  await page.getByRole('button', { name: 'Nuevo reto' }).click();
  await page.getByLabel('Nombre').fill('Charla de apertura');
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Auditorio principal' });
  await page.getByLabel('Puntos').fill('20');
  await page.getByLabel('Tope de participaciones').fill('150');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('0 de 150 participaciones')).toBeVisible();
  await page.getByRole('link', { name: 'Resumen' }).click();
  await expect(page.getByText('El reto «Charla de apertura» no tiene pantalla')).toBeVisible();
  await expect(page.getByText('Crea al menos un reto')).toHaveCount(0);

  // HU-203: invita a un registrador, que acepta desde otro navegador y ve solo lo suyo.
  await page.getByRole('link', { name: 'Equipo' }).click();
  await page.getByRole('button', { name: 'Invitar' }).click();
  const registradorEmail = createEmailPrueba('registrador');
  await page.getByLabel('Correo').fill(registradorEmail);
  await page.getByLabel('Nombre').fill('Rita e2e');
  await page.getByRole('radio', { name: /Registrador/ }).check();
  await page.getByRole('button', { name: 'Enviar la invitación' }).click();
  await expect(page.getByText(`Enviamos la invitación a ${registradorEmail}`)).toBeVisible();
  await expect(page.getByText('Invitación enviada')).toBeVisible();

  const otro = await browser.newContext();
  const registrador = await otro.newPage();
  await registrador.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
  const invitacion = await getEnlaceCorreo(registradorEmail, 'invitacion_equipo');
  await registrador.goto(new URL(invitacion).pathname);
  await expect(registrador.getByRole('heading', { level: 1 })).toContainText(
    'te invitó como registrador',
  );
  await registrador.getByLabel('Tu nombre').fill('Rita e2e');
  await registrador.getByLabel('Elige tu contraseña').fill('la frase de rita en e2e');
  await registrador.getByRole('checkbox').check();
  await registrador.getByRole('button', { name: 'Crear mi cuenta y aceptar' }).click();
  await expect(registrador.getByRole('heading', { level: 1 })).toHaveText('Mis eventos');
  await registrador.getByText('Encuentro e2e').click();
  await expect(registrador.getByRole('heading', { level: 1 })).toHaveText('Encuentro e2e');
  // El registrador no ve Equipo ni Bitácora, ni el botón para publicar.
  await expect(registrador.getByRole('link', { name: 'Equipo' })).toHaveCount(0);
  await expect(registrador.getByRole('link', { name: 'Bitácora' })).toHaveCount(0);
  await expect(registrador.getByRole('button', { name: 'Publicar' })).toHaveCount(0);
  await otro.close();

  await page.reload();
  await expect(page.getByText('Activo')).toBeVisible();
});
