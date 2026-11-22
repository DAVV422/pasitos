import { expect, test } from '@playwright/test';
import { createIpPrueba, seedEventoPublicoConInvitado } from './apoyo/base';

/**
 * Una tablet Android con Chrome en modo escritorio dice ser una computadora Linux (sin «Android»).
 * La app avisa, pero deja seguir y entrar con ese dispositivo. Solo en escritorio.
 */
const TABLET_MODO_ESCRITORIO =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
});

test('una tablet en modo escritorio: avisa, deja cancelar y deja seguir y entrar', async ({
  browser,
}) => {
  const { token } = await seedEventoPublicoConInvitado(`Feria con tablet ${Date.now()}`);
  const contexto = await browser.newContext({
    userAgent: TABLET_MODO_ESCRITORIO,
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    extraHTTPHeaders: { 'X-Forwarded-For': createIpPrueba() },
  });
  const tablet = await contexto.newPage();
  await tablet.goto(`/app/acceso/invitacion/${token}`);
  await expect(tablet.getByRole('heading', { level: 1 })).toHaveText(
    '¿Seguir en este dispositivo?',
  );

  // Cancelar: el QR para seguir en el celular, con la opción de volver.
  await tablet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(tablet.getByRole('heading', { level: 1 })).toHaveText('Sigue en tu celular');
  await tablet.getByRole('button', { name: 'Mejor sigo en este dispositivo' }).click();

  // Seguir: la bienvenida de siempre, y entra.
  await tablet.getByRole('button', { name: 'Seguir en este dispositivo' }).click();
  await tablet.getByRole('button', { name: 'Entrar' }).click();
  await expect(tablet).toHaveURL(/\/app\/inicio/);
  await contexto.close();
});
