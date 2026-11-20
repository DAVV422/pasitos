import { expect, test } from '@playwright/test';
import { createEmailPrueba, createIpPrueba, seedEventoPublico } from './apoyo/base';

/**
 * El formulario de contacto de la landing (HU-410): se carga al llegar a la sección y el mensaje
 * llega. Solo en escritorio: el límite es de 3 envíos por hora por IP.
 */
test.beforeEach(async ({ browserName, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio' || browserName !== 'chromium');
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': createIpPrueba() });
});

test('dejar los datos en el formulario de contacto', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Quiero usar Pasitos en mi evento' }).click();
  const formulario = page.getByTestId('contacto-form');
  await expect(formulario).toBeVisible();
  await formulario.getByLabel('Nombre').fill('Carla de prueba');
  await formulario.getByLabel('Correo').fill(createEmailPrueba('contacto'));
  await formulario.getByLabel('Tipo de evento').selectOption('meetup');
  await formulario
    .getByLabel('Cuéntanos de tu evento')
    .fill('Queremos usar Pasitos en nuestro meetup de diciembre.');
  await formulario.getByRole('checkbox').check();
  await formulario.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByTestId('contacto-enviado')).toHaveText('Gracias, te escribiremos pronto.');
});

test('la sección Eventos muestra los públicos y no los privados (HU-405)', async ({ page }) => {
  const sufijo = Date.now();
  const publico = `Encuentro público ${sufijo}`;
  const privado = `Encuentro privado ${sufijo}`;
  await seedEventoPublico(publico);
  await seedEventoPublico(privado, 'privado');
  await page.goto('/eventos?momento=proximos');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eventos');
  await expect(page.getByText(publico)).toBeVisible();
  await expect(page.getByText(privado)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Próximos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
