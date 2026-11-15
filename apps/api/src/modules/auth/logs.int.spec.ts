import { Writable } from 'node:stream';
import { and, desc, eq } from 'drizzle-orm';
import { enviosCorreo } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import {
  getCookieSesion,
  seedUsuario,
  startApiDePrueba,
  type ApiDePrueba,
} from '../../pruebas/api-de-prueba';
import { generateCodigoTotp, getPaso } from './totp';

/**
 * HU-201: ni la contraseña ni los tokens ni el secreto de TOTP aparecen en los logs. Se leen los
 * logs de pino (nivel debug) de un recorrido completo y se buscan los valores. Requiere Docker.
 */
describe('Logs sin secretos (HU-201)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let logs = '';

  beforeAll(async () => {
    base = await startBaseDePrueba();
    const destino = new Writable({
      write(trozo: Buffer, _codificacion, listo) {
        logs += trozo.toString('utf-8');
        listo();
      },
    });
    api = await startApiDePrueba(base, { destinoLogs: destino });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  it('un recorrido con contraseña, enlace de restablecer y app de códigos no deja secretos', async () => {
    const frase = 'frase larga de prueba para logs';
    const nueva = 'otra frase larga para logs';
    await seedUsuario(base, { email: 'logs@example.com', password: frase, dueno: true });
    const pedir = (method: 'POST' | 'GET', url: string, body?: object, cookie?: string) =>
      api.app.inject({
        method,
        url: `/api/v1${url}`,
        ...(body ? { payload: body } : {}),
        ...(cookie ? { headers: { cookie } } : {}),
      });

    await pedir('POST', '/auth/login', { email: 'logs@example.com', password: 'equivocada 123' });
    const login = await pedir('POST', '/auth/login', {
      email: 'logs@example.com',
      password: frase,
    });
    const cookie = getCookieSesion(login) ?? '';
    const { secreto } = (
      await pedir('POST', '/auth/segundo-factor/totp/configurar', {}, cookie)
    ).json();
    const codigo = generateCodigoTotp(secreto, getPaso(api.reloj.now()));
    await pedir('POST', '/auth/segundo-factor/totp/confirmar', { codigo }, cookie);

    await pedir('POST', '/auth/password/olvide', { email: 'logs@example.com' });
    const [correo] = await base.sistema.db
      .select({ datos: enviosCorreo.datos })
      .from(enviosCorreo)
      .where(
        and(
          eq(enviosCorreo.destinatario, 'logs@example.com'),
          eq(enviosCorreo.tipo, 'restablecer_password'),
        ),
      )
      .orderBy(desc(enviosCorreo.createdAt));
    const token = (correo?.datos as { enlace: string }).enlace.split('/').at(-1) ?? '';
    await pedir('POST', '/auth/password/restablecer', { token, password: nueva });

    // Hubo logs (los pedidos), pero sin ningún secreto.
    expect(logs).toContain('/api/v1/auth/login');
    for (const secretoBuscado of [
      frase,
      nueva,
      'equivocada 123',
      token,
      secreto,
      codigo,
      cookie.split('=')[1] ?? '',
    ]) {
      expect(secretoBuscado.length).toBeGreaterThan(5);
      expect(logs).not.toContain(secretoBuscado);
    }
    expect(logs).not.toContain('logs@example.com');
  });
});
