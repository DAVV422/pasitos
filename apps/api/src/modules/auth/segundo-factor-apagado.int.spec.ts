import { eq } from 'drizzle-orm';
import { usuarios } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import {
  getCookieSesion,
  seedUsuario,
  startApiDePrueba,
  type ApiDePrueba,
} from '../../pruebas/api-de-prueba';

const PASSWORD = 'una frase larga de prueba';

/**
 * `SEGUNDO_FACTOR_ORGANIZACIONES=apagado` (la demo): las organizaciones entran con la contraseña;
 * la plataforma lo sigue pidiendo. Requiere Docker.
 */
describe('Segundo factor apagado para las organizaciones', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base, { config: { SEGUNDO_FACTOR_ORGANIZACIONES: 'apagado' } });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function login(email: string) {
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
      remoteAddress: `10.7.0.${Math.floor(Math.random() * 250) + 1}`,
    });
    const yo = await api.app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      headers: { cookie: getCookieSesion(respuesta) },
    });
    return yo.json().segundoFactor;
  }

  it('la dueña de una organización entra solo con la contraseña', async () => {
    await seedUsuario(base, { email: 'duena@example.com', password: PASSWORD, dueno: true });
    expect(await login('duena@example.com')).toMatchObject({
      estado: 'no_aplica',
      requerido: false,
      apagado: true,
    });
  });

  it('aunque ya tenga un método configurado, no se lo pide (y lo conserva)', async () => {
    const id = await seedUsuario(base, {
      email: 'con-totp@example.com',
      password: PASSWORD,
      dueno: true,
    });
    await base.sistema.db
      .update(usuarios)
      .set({ totpSecretCifrado: Buffer.from('cualquiera') })
      .where(eq(usuarios.id, id));
    expect(await login('con-totp@example.com')).toMatchObject({
      estado: 'no_aplica',
      metodos: ['totp'],
    });
  });

  it('un administrador de plataforma lo sigue necesitando', async () => {
    const id = await seedUsuario(base, { email: 'admin@example.com', password: PASSWORD });
    await base.sistema.db
      .update(usuarios)
      .set({ rolPlataforma: 'superadmin' })
      .where(eq(usuarios.id, id));
    expect(await login('admin@example.com')).toMatchObject({
      estado: 'por_configurar',
      requerido: true,
      apagado: false,
    });
  });
});
