import { devices, expect, test, type Page } from '@playwright/test';
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
  // Recorre varias HU seguidas: con toda la suite en paralelo, 30 s no alcanzan.
  test.setTimeout(90_000);
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
  await page.getByLabel('Empieza').fill('10/03/2030 09:00');
  await page.getByLabel('Termina').fill('10/03/2030 18:00');
  await page.getByRole('button', { name: 'Crear el evento' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Encuentro e2e');
  await expect(page.getByText('Crea al menos un reto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  await page.getByRole('link', { name: 'Bitácora', exact: true }).click();
  await expect(page.getByText('Creó el evento')).toBeVisible();

  // HU-206 y HU-214: configura el evento, sube el logo y crea un lugar.
  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
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
  await page.getByRole('link', { name: 'Lugares', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar lugar' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Auditorio principal');
  await page.getByLabel('Número en el plano').fill('1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Auditorio principal')).toBeVisible();

  // HU-207: crea un reto de QR en ese lugar; la lista de chequeo pide ahora su pantalla.
  await page.getByRole('link', { name: 'Retos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo reto' }).click();
  await page.getByLabel('Nombre').fill('Charla de apertura');
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Auditorio principal' });
  await page.getByLabel('Puntos').fill('20');
  await page.getByLabel('Tope de participaciones').fill('150');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('0 de 150 participaciones')).toBeVisible();
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.getByText('El reto «Charla de apertura» no tiene pantalla')).toBeVisible();
  await expect(page.getByText('Crea al menos un reto')).toHaveCount(0);

  // HU-209: crea una pantalla y una mesa, y las conecta con su enlace desde otro navegador.
  await page.getByRole('link', { name: 'Pantallas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva pantalla' }).click();
  await page.getByLabel('Nombre').fill('Tablet Auditorio');
  await page.getByLabel('Lugar').selectOption({ label: 'Auditorio principal' });
  await page.getByLabel('PIN de los controles').fill('4821');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Tablet Auditorio')).toBeVisible();
  const tablet = await browser.newContext();
  const sala = await tablet.newPage();
  await sala.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('img', { name: 'QR para conectar la tablet' })).toBeVisible();
  // El QR se dibuja de verdad (no un recuadro vacío).
  const qr = await page.getByRole('img', { name: 'QR para conectar la tablet' }).boundingBox();
  expect(qr?.width).toBeGreaterThan(200);
  const enlaceSala = (await page.locator('code').textContent()) ?? '';
  await sala.goto(new URL(enlaceSala).pathname);
  await expect(sala.getByText('Conectada')).toBeVisible();
  await expect(sala.getByText('Tablet Auditorio · Auditorio principal')).toBeVisible();
  // El enlace sirve una vez (V12).
  await sala.goto(new URL(enlaceSala).pathname);
  await expect(
    sala.getByText('Este enlace ya se usó. Pide uno nuevo al organizador.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByText('En línea')).toBeVisible();

  await page.getByRole('link', { name: 'Mesas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva mesa' }).click();
  await page.getByLabel('Nombre').fill('Mesa 1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Conectar' }).click();
  const enlaceMesa = (await page.locator('code').textContent()) ?? '';
  const mesa = await tablet.newPage();
  await mesa.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
  await mesa.goto(new URL(enlaceMesa).pathname);
  await expect(mesa.getByText('Conectada')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByText('En línea')).toBeVisible();
  await tablet.close();
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.getByText('El reto «Charla de apertura» no tiene pantalla')).toHaveCount(0);

  // HU-212: las reglas de la puerta y de los puntos.
  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
  await page.getByRole('tab', { name: 'Reglas y puerta' }).click();
  await page.getByLabel('Tope de registros del evento').fill('300');
  await page.getByLabel('Puntos de bienvenida').fill('10');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();

  // HU-210: agrega un invitado a mano; uno con el nombre casi igual avisa antes de repetirlo.
  await page.getByRole('link', { name: 'Invitados', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar invitado' }).click();
  await page.getByLabel('Nombre').fill('Valeria Quispe');
  await page.getByRole('textbox', { name: /^Correo/ }).fill(createEmailPrueba('valeria'));
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('A-0001 · Valeria Quispe: guardado.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar invitado' }).click();
  await page.getByLabel('Nombre').fill('Valeria Quispe');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Hay alguien con un nombre muy parecido en la lista')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('quis');
  await expect(page.getByText('1 en la lista')).toBeVisible();

  // HU-211: envía su invitación; queda en la cola con la fecha en que sale.
  page.once('dialog', (dialogo) => void dialogo.accept());
  await page.getByRole('button', { name: 'Más' }).click();
  await page.getByRole('button', { name: 'Enviar invitaciones (1 pendientes)' }).click();
  await expect(page.getByText('Pusimos 1 invitaciones en la cola.')).toBeVisible();
  await expect(page.getByText(/En cola \(sale el/)).toBeVisible();

  // HU-306: Valeria abre su enlace en el celular, toca Entrar y queda vinculada. El enlace sale de
  // *Descargar enlaces* (el del correo lo arma el trabajador al enviarlo).
  const eventoId = /eventos\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  const csv = await (
    await page.request.get(`/api/v1/eventos/${eventoId}/invitaciones/enlaces`)
  ).text();
  const enlaceValeria = /\/app\/acceso\/invitacion\/[A-Za-z0-9_-]+/.exec(csv)?.[0] ?? '';
  expect(enlaceValeria).not.toBe('');
  const celularValeria = await browser.newContext({ ...devices['Pixel 7'] });
  const celular = await celularValeria.newPage();
  await celular.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
  await celular.goto(new URL(enlaceValeria, page.url()).href);
  await expect(celular.getByRole('heading', { level: 1 })).toHaveText('Hola, Valeria');
  await celular.getByRole('button', { name: 'Entrar' }).click();
  await expect(celular).toHaveURL(/\/app\/inicio$/);
  await expect(celular.getByText('Pasa por la puerta para empezar a ganar puntos.')).toBeVisible();
  await expect(celular.getByTestId('saldo')).toHaveText('0');
  // HU-308 y HU-311: la barra inferior, Mi entrada con su código y el historial vacío.
  const barra = celular.getByRole('navigation', { name: 'Principal' });
  await expect(barra.getByRole('link', { name: 'Retos' })).toBeVisible();
  await celular.getByRole('link', { name: 'Mi entrada' }).click();
  await expect(celular).toHaveURL(/\/app\/mi-entrada$/);
  await expect(celular.getByTestId('codigo')).toHaveText('A-0001');
  await expect(celular.getByRole('img', { name: 'QR de tu entrada' })).toBeVisible();
  await barra.getByRole('link', { name: 'Más' }).click();
  await celular.getByRole('link', { name: /Historial/ }).click();
  await expect(celular.getByText('Todavía no tienes movimientos.')).toBeVisible();
  // Al volver a abrir la app, entra directo (la sesión vive en la cookie).
  await celular.goto(new URL('/app/', page.url()).href);
  await expect(celular).toHaveURL(/\/app\/inicio$/);
  // El mismo enlace en otro celular ya no sirve.
  const otroCelular = await browser.newContext({ ...devices['Pixel 7'] });
  const ajeno = await otroCelular.newPage();
  await ajeno.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
  await ajeno.goto(new URL(enlaceValeria, page.url()).href);
  await expect(ajeno.getByText('Este enlace ya se usó en otro celular')).toBeVisible();
  await otroCelular.close();
  await celularValeria.close();

  // HU-203: invita a un registrador, que acepta desde otro navegador y ve solo lo suyo.
  await page.getByRole('link', { name: 'Equipo', exact: true }).click();
  await page.getByRole('button', { name: 'Invitar' }).click();
  const registradorEmail = createEmailPrueba('registrador');
  await page.getByLabel('Correo').fill(registradorEmail);
  await page.getByLabel('Nombre').fill('Rita e2e');
  await page.getByLabel('Rol', { exact: true }).selectOption('registrador');
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
  await expect(registrador.getByRole('link', { name: 'Equipo', exact: true })).toHaveCount(0);
  await expect(registrador.getByRole('link', { name: 'Bitácora', exact: true })).toHaveCount(0);
  await expect(registrador.getByRole('button', { name: 'Publicar' })).toHaveCount(0);
  // HU-301: en la Puerta busca a Valeria y ve su ficha, con el correo enmascarado.
  await registrador.getByRole('link', { name: 'Puerta', exact: true }).click();
  await expect(registrador.getByRole('heading', { level: 1 })).toHaveText('Puerta');
  await registrador.getByLabel('Nombre, código o correo').fill('Valer');
  await registrador.getByRole('button', { name: /Valeria/ }).click();
  await expect(registrador.getByTestId('nombre')).toContainText('Valeria');
  await expect(registrador.getByText(/va•••@/)).toBeVisible();
  // El evento sigue en borrador: la puerta no marca (el resto lo cubren las pruebas del API).
  await registrador.getByRole('button', { name: 'Marcar presente' }).click();
  await expect(registrador.getByText('Publica el evento para marcar la asistencia.')).toBeVisible();
  await expect(registrador.getByTestId('contador')).toContainText('0 presentes de 1');
  await otro.close();

  await page.reload();
  await expect(page.getByText('Activo')).toBeVisible();
});
