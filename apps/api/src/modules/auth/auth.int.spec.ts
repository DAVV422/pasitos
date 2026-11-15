import { and, eq } from 'drizzle-orm';
import { enviosCorreo, sessions, usuarios } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import {
  getCookieSesion,
  seedUsuario,
  startApiDePrueba,
  type ApiDePrueba,
} from '../../pruebas/api-de-prueba';
import { generateCodigoTotp, getPaso } from './totp';

const PASSWORD = 'una frase larga de prueba';
const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;

/** `/auth` de punta a punta en el API, con PostgreSQL real (HU-201). Requiere Docker. */
describe('Sesión del equipo (HU-201)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let ipSiguiente = 1;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  /** Cada test con su IP, para que el límite por IP de uno no afecte al otro. */
  let ip = '10.0.0.1';
  beforeEach(() => {
    ip = `10.0.${Math.floor(ipSiguiente / 250)}.${ipSiguiente % 250}`;
    ipSiguiente += 1;
  });

  function request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    opciones: { cookie?: string | undefined; body?: unknown } = {},
  ) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      remoteAddress: ip,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0',
        ...(opciones.cookie ? { cookie: opciones.cookie } : {}),
      },
      ...(opciones.body !== undefined ? { payload: opciones.body as object } : {}),
    });
  }

  async function login(email: string, password = PASSWORD) {
    const respuesta = await request('POST', '/auth/login', { body: { email, password } });
    return { respuesta, cookie: getCookieSesion(respuesta) };
  }

  function listCorreos(destinatario: string, tipo: string) {
    return base.sistema.db
      .select()
      .from(enviosCorreo)
      .where(and(eq(enviosCorreo.destinatario, destinatario), eq(enviosCorreo.tipo, tipo)));
  }

  async function getEnlaceRestablecer(email: string): Promise<string> {
    const correos = await listCorreos(email, 'restablecer_password');
    const enlace = (correos.at(-1)?.datos as { enlace: string }).enlace;
    return enlace.split('/').at(-1) ?? '';
  }

  // ── Entrar ─────────────────────────────────────────────────────────────────

  it('entra con correo y contraseña: cookie HttpOnly y /auth/yo', async () => {
    await seedUsuario(base, { email: 'entra@example.com', password: PASSWORD, nombre: 'Ana' });
    const { respuesta, cookie } = await login('  ENTRA@example.com ');
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      usuario: { email: 'entra@example.com', nombre: 'Ana' },
      requiereSegundoFactor: false,
      segundoFactor: { requerido: false, configurado: false, estado: 'no_aplica' },
    });
    const setCookie = String(respuesta.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/api');

    const yo = await request('GET', '/auth/yo', { cookie });
    expect(yo.statusCode).toBe(200);
    expect(yo.json().usuario.nombre).toBe('Ana');

    const [sesion] = await base.sistema.db
      .select()
      .from(sessions)
      .where(eq(sessions.tipo, 'usuario'));
    expect(sesion?.dispositivo).toBe('Chrome en Windows');
  });

  it('el mismo error si el correo no existe o la contraseña está mal', async () => {
    await seedUsuario(base, { email: 'mismo@example.com', password: PASSWORD });
    const noExiste = await login('nadie@example.com');
    const mal = await login('mismo@example.com', 'otra contraseña cualquiera');
    expect(noExiste.respuesta.statusCode).toBe(401);
    expect(mal.respuesta.statusCode).toBe(401);
    const sinTraza = (r: typeof mal.respuesta) => ({ ...r.json(), traceId: undefined });
    expect(sinTraza(noExiste.respuesta)).toEqual(sinTraza(mal.respuesta));
    expect(mal.respuesta.json().code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('el tiempo de respuesta es parecido exista o no el correo', async () => {
    await seedUsuario(base, { email: 'tiempo@example.com', password: PASSWORD });
    const medir = async (email: string) => {
      const inicio = performance.now();
      ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
      await login(email, 'otra contraseña cualquiera');
      return performance.now() - inicio;
    };
    const tiempos: { existe: number[]; noExiste: number[] } = { existe: [], noExiste: [] };
    for (let i = 0; i < 6; i++) {
      tiempos.existe.push(await medir('tiempo@example.com'));
      tiempos.noExiste.push(await medir(`nadie${i}@example.com`));
      api.reloj.advance(30 * SEGUNDO);
    }
    // La mediana: un pico de la computadora no decide el resultado.
    const mediana = (valores: number[]) =>
      [...valores].sort((a, b) => a - b)[valores.length >> 1] ?? 0;
    expect(Math.abs(mediana(tiempos.existe) - mediana(tiempos.noExiste))).toBeLessThan(50);
  });

  it('V14: espera creciente desde el 6.º fallo y bloqueo de 15 min al 10.º, con correo', async () => {
    const usuarioId = await seedUsuario(base, { email: 'v14@example.com', password: PASSWORD });
    for (let fallo = 1; fallo <= 10; fallo++) {
      const { respuesta } = await login('v14@example.com', 'contraseña equivocada');
      expect(respuesta.json().code).toBe('CREDENCIALES_INVALIDAS');
      if (fallo === 6) {
        // Dentro de la espera de 2 s: 429 sin mirar la contraseña.
        const enEspera = await login('v14@example.com', PASSWORD);
        expect(enEspera.respuesta.statusCode).toBe(429);
        expect(enEspera.respuesta.headers['retry-after']).toBe('2');
      }
      // 20 s entre intentos: menos de 5 por minuto y más que la espera más larga (16 s).
      api.reloj.advance(20 * SEGUNDO);
    }
    const bloqueado = await login('v14@example.com', PASSWORD);
    expect(bloqueado.respuesta.statusCode).toBe(429);
    expect(bloqueado.respuesta.json().code).toBe('DEMASIADOS_INTENTOS');
    expect(Number(bloqueado.respuesta.headers['retry-after'])).toBeGreaterThan(14 * 60);
    expect(await listCorreos('v14@example.com', 'cuenta_bloqueada')).toHaveLength(1);

    // A los 15 minutos entra, y el contador vuelve a 0.
    api.reloj.advance(15 * MINUTO);
    expect((await login('v14@example.com')).respuesta.statusCode).toBe(200);
    const [fila] = await base.sistema.db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
    expect(fila).toMatchObject({ intentosFallidos: 0, bloqueadoHasta: null });
  });

  it('límite por IP: el 6.º intento en un minuto responde 429', async () => {
    for (let i = 0; i < 5; i++) {
      await login(`ip${i}@example.com`);
    }
    const sexto = await login('ip6@example.com');
    expect(sexto.respuesta.statusCode).toBe(429);
    expect(sexto.respuesta.json().code).toBe('DEMASIADOS_INTENTOS');
    api.reloj.advance(MINUTO);
  });

  // ── Recuperar y cambiar la contraseña ──────────────────────────────────────

  it('olvidé mi contraseña: siempre 202; el enlace sirve una vez y cierra las sesiones (V15)', async () => {
    await seedUsuario(base, { email: 'olvide@example.com', password: PASSWORD });
    const { cookie } = await login('olvide@example.com');

    expect(
      (await request('POST', '/auth/password/olvide', { body: { email: 'nadie@example.com' } }))
        .statusCode,
    ).toBe(202);
    const pedido = await request('POST', '/auth/password/olvide', {
      body: { email: 'olvide@example.com', app: 'plataforma' },
    });
    expect(pedido.statusCode).toBe(202);
    const [correo] = await listCorreos('olvide@example.com', 'restablecer_password');
    expect((correo?.datos as { enlace: string }).enlace).toMatch(
      /^http:\/\/localhost:8080\/plataforma\/restablecer\/[\w-]{43}$/,
    );
    const token = await getEnlaceRestablecer('olvide@example.com');

    const nueva = 'otra frase larga y nueva';
    const primera = await request('POST', '/auth/password/restablecer', {
      body: { token, password: nueva },
    });
    expect(primera.statusCode).toBe(204);
    const segunda = await request('POST', '/auth/password/restablecer', {
      body: { token, password: nueva },
    });
    expect(segunda.statusCode).toBe(422);
    expect(segunda.json().code).toBe('ENLACE_VENCIDO');

    expect((await request('GET', '/auth/yo', { cookie })).statusCode).toBe(401);
    expect((await login('olvide@example.com', nueva)).respuesta.statusCode).toBe(200);
    expect(await listCorreos('olvide@example.com', 'password_cambiada')).toHaveLength(1);
  });

  it('V15: el enlace vence a los 30 minutos', async () => {
    await seedUsuario(base, { email: 'vence@example.com', password: PASSWORD });
    await request('POST', '/auth/password/olvide', { body: { email: 'vence@example.com' } });
    const token = await getEnlaceRestablecer('vence@example.com');
    api.reloj.advance(31 * MINUTO);
    const respuesta = await request('POST', '/auth/password/restablecer', {
      body: { token, password: 'otra frase larga y nueva' },
    });
    expect(respuesta.json().code).toBe('ENLACE_VENCIDO');
  });

  it('restablecer en paralelo con el mismo enlace: solo uno gana', async () => {
    await seedUsuario(base, { email: 'paralelo@example.com', password: PASSWORD });
    await request('POST', '/auth/password/olvide', { body: { email: 'paralelo@example.com' } });
    const token = await getEnlaceRestablecer('paralelo@example.com');
    const respuestas = await Promise.all(
      ['primera frase larga nueva', 'segunda frase larga nueva'].map((password) =>
        request('POST', '/auth/password/restablecer', { body: { token, password } }),
      ),
    );
    expect(respuestas.map((r) => r.statusCode).sort()).toEqual([204, 422]);
  });

  it('V16: rechaza contraseñas comunes y filtradas con un texto claro', async () => {
    await seedUsuario(base, { email: 'v16@example.com', password: PASSWORD });
    api.filtradas.filtradas.add('esta frase salio en una filtracion');
    const casos: [string, string][] = [
      ['1234567', 'corta'],
      ['12345678', 'comun'],
      ['pasitos2026', 'comun'],
      ['esta frase salio en una filtracion', 'filtrada'],
    ];
    for (const [password, motivo] of casos) {
      await request('POST', '/auth/password/olvide', { body: { email: 'v16@example.com' } });
      const token = await getEnlaceRestablecer('v16@example.com');
      const respuesta = await request('POST', '/auth/password/restablecer', {
        body: { token, password },
      });
      if (motivo === 'corta') {
        expect(respuesta.json().code).toBe('VALIDACION');
        continue;
      }
      expect(respuesta.statusCode).toBe(422);
      expect(respuesta.json()).toMatchObject({ code: 'PASSWORD_INSEGURA', meta: { motivo } });
      expect(respuesta.json().detail.length).toBeGreaterThan(20);
      // Hay 3 pedidos de enlace por hora por correo.
      api.reloj.advance(61 * MINUTO);
    }
  });

  it('cambiar la contraseña pide la actual y cierra las demás sesiones', async () => {
    await seedUsuario(base, { email: 'cambia@example.com', password: PASSWORD });
    const una = await login('cambia@example.com');
    const otra = await login('cambia@example.com');
    const mal = await request('PUT', '/auth/password', {
      cookie: una.cookie,
      body: { actual: 'no es la actual', nueva: 'una frase nueva y larga' },
    });
    expect(mal.json().code).toBe('CREDENCIALES_INVALIDAS');
    const bien = await request('PUT', '/auth/password', {
      cookie: una.cookie,
      body: { actual: PASSWORD, nueva: 'una frase nueva y larga' },
    });
    expect(bien.statusCode).toBe(204);
    expect((await request('GET', '/auth/yo', { cookie: una.cookie })).statusCode).toBe(200);
    expect((await request('GET', '/auth/yo', { cookie: otra.cookie })).statusCode).toBe(401);
    expect(await listCorreos('cambia@example.com', 'password_cambiada')).toHaveLength(1);
  });

  // ── Sesiones ───────────────────────────────────────────────────────────────

  it('lista las sesiones abiertas, cierra una al instante y vence a las 12 h sin uso', async () => {
    await seedUsuario(base, { email: 'sesiones@example.com', password: PASSWORD });
    const una = await login('sesiones@example.com');
    const otra = await login('sesiones@example.com');
    const lista = await request('GET', '/auth/sessions', { cookie: una.cookie });
    expect(lista.json().items).toHaveLength(2);
    const ajena = lista.json().items.find((s: { actual: boolean }) => !s.actual);
    expect(
      (await request('DELETE', `/auth/sessions/${ajena.id}`, { cookie: una.cookie })).statusCode,
    ).toBe(204);
    expect((await request('GET', '/auth/yo', { cookie: otra.cookie })).json().code).toBe(
      'NO_AUTENTICADO',
    );

    api.reloj.advance(12 * 60 * MINUTO + SEGUNDO);
    expect((await request('GET', '/auth/yo', { cookie: una.cookie })).json().code).toBe(
      'SESION_VENCIDA',
    );
  });

  it('cerrar sesión revoca la sesión y borra la cookie', async () => {
    await seedUsuario(base, { email: 'logout@example.com', password: PASSWORD });
    const { cookie } = await login('logout@example.com');
    const respuesta = await request('POST', '/auth/logout', { cookie });
    expect(respuesta.statusCode).toBe(204);
    expect(String(respuesta.headers['set-cookie'])).toContain('px_equipo=;');
    expect((await request('GET', '/auth/yo', { cookie })).statusCode).toBe(401);
  });

  // ── Segundo factor ─────────────────────────────────────────────────────────

  it('la dueña de una organización configura la app de códigos antes de usar nada más', async () => {
    await seedUsuario(base, { email: 'duena@example.com', password: PASSWORD, dueno: true });
    const { respuesta, cookie } = await login('duena@example.com');
    expect(respuesta.json()).toMatchObject({
      requiereSegundoFactor: true,
      segundoFactor: { requerido: true, configurado: false, estado: 'por_configurar' },
    });
    const bloqueada = await request('GET', '/auth/sessions', { cookie });
    expect(bloqueada.json()).toMatchObject({
      code: 'SEGUNDO_FACTOR_REQUERIDO',
      meta: { motivo: 'configurar' },
    });

    const alta = await request('POST', '/auth/segundo-factor/totp/configurar', { cookie });
    const { secreto, otpauthUrl } = alta.json();
    expect(otpauthUrl).toContain('otpauth://totp/Pasitos');
    const malo = await request('POST', '/auth/segundo-factor/totp/confirmar', {
      cookie,
      body: { codigo: '000000' },
    });
    expect(malo.json().code).toBe('CODIGO_INVALIDO');
    const codigo = generateCodigoTotp(secreto, getPaso(api.reloj.now()));
    const confirmar = await request('POST', '/auth/segundo-factor/totp/confirmar', {
      cookie,
      body: { codigo },
    });
    expect(confirmar.statusCode).toBe(204);
    expect((await request('GET', '/auth/sessions', { cookie })).statusCode).toBe(200);

    // En la sesión siguiente se pide el código; el mismo código no sirve dos veces.
    const nueva = await login('duena@example.com');
    expect(nueva.respuesta.json().segundoFactor.estado).toBe('por_verificar');
    expect((await request('GET', '/auth/sessions', { cookie: nueva.cookie })).json().meta).toEqual({
      motivo: 'verificar',
    });
    const repetido = await request('POST', '/auth/segundo-factor/totp', {
      cookie: nueva.cookie,
      body: { codigo },
    });
    expect(repetido.json().code).toBe('CODIGO_INVALIDO');
    api.reloj.advance(30 * SEGUNDO);
    const siguiente = generateCodigoTotp(secreto, getPaso(api.reloj.now()));
    expect(
      (
        await request('POST', '/auth/segundo-factor/totp', {
          cookie: nueva.cookie,
          body: { codigo: siguiente },
        })
      ).statusCode,
    ).toBe(204);
    expect((await request('GET', '/auth/sessions', { cookie: nueva.cookie })).statusCode).toBe(200);

    // Es obligatorio: no puede quitar su único método.
    const quitar = await request('DELETE', '/auth/segundo-factor/totp', { cookie: nueva.cookie });
    expect(quitar.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'metodo' }] });

    // El secreto está cifrado en la base.
    const [fila] = await base.sistema.db
      .select({ secreto: usuarios.totpSecretCifrado })
      .from(usuarios)
      .where(eq(usuarios.email, 'duena@example.com'));
    expect(fila?.secreto?.toString('latin1')).not.toContain(secreto);
  });

  it('5 códigos mal seguidos: 5 minutos de espera', async () => {
    await seedUsuario(base, { email: 'codigos@example.com', password: PASSWORD, dueno: true });
    const { cookie } = await login('codigos@example.com');
    const { secreto } = (
      await request('POST', '/auth/segundo-factor/totp/configurar', { cookie })
    ).json();
    for (let i = 0; i < 5; i++) {
      await request('POST', '/auth/segundo-factor/totp/confirmar', {
        cookie,
        body: { codigo: '000000' },
      });
    }
    const bien = generateCodigoTotp(secreto, getPaso(api.reloj.now()));
    const espera = await request('POST', '/auth/segundo-factor/totp/confirmar', {
      cookie,
      body: { codigo: bien },
    });
    expect(espera.statusCode).toBe(429);
    api.reloj.advance(5 * MINUTO);
    const ahora = generateCodigoTotp(secreto, getPaso(api.reloj.now()));
    // Pasada la espera, el alta (que vale 10 min) se confirma con el código de ahora.
    expect(
      (
        await request('POST', '/auth/segundo-factor/totp/confirmar', {
          cookie,
          body: { codigo: ahora },
        })
      ).statusCode,
    ).toBe(204);
  });

  it('sin sesión, toda ruta que no es pública responde 401', async () => {
    expect((await request('GET', '/auth/yo')).json().code).toBe('NO_AUTENTICADO');
    expect(
      (await request('GET', '/auth/sessions', { cookie: 'px_equipo=inventada' })).statusCode,
    ).toBe(401);
    expect((await request('GET', '/salud')).statusCode).not.toBe(401);
  });
});
