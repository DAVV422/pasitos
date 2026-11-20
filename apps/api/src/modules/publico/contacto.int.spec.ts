import { and, eq } from 'drizzle-orm';
import { bitacora, enviosCorreo, mensajesContacto } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createPersonaConSesion, type PersonaDePrueba } from '../../pruebas/equipo-de-prueba';

const DATOS = {
  nombre: 'Carla Rojas',
  email: 'carla@example.com',
  organizacion: 'Comunidad de Ejemplo',
  tipoEvento: 'meetup',
  asistentesAprox: '100_300',
  mensaje: 'Queremos usar Pasitos en nuestro meetup de diciembre.',
  aceptaPrivacidad: true,
};

/** Formulario de contacto y su bandeja (HU-410), con PostgreSQL real. Requiere Docker. */
describe('Contacto (HU-410)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let admin: PersonaDePrueba;
  let soporte: PersonaDePrueba;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    const ahora = api.reloj.now();
    admin = await createPersonaConSesion(base, 'Admin Contacto', ahora, {
      rolPlataforma: 'admin',
      email: 'admin-contacto@example.com',
    });
    soporte = await createPersonaConSesion(base, 'Soporte Contacto', ahora, {
      rolPlataforma: 'soporte',
    });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  /** Cada envío desde otra IP, salvo que el test diga cuál. */
  function enviar(cuerpo: object, desde?: string) {
    ip++;
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/publico/contacto',
      remoteAddress: desde ?? `198.51.100.${ip}`,
      payload: cuerpo,
    });
  }

  function pedir(method: 'GET' | 'PATCH', url: string, quien: PersonaDePrueba, body?: object) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: quien.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  it('el formulario guarda el mensaje sin la IP y avisa a los administradores sin el mensaje', async () => {
    const respuesta = await enviar({ ...DATOS, email: 'uno@example.com' });
    expect(respuesta.statusCode).toBe(201);
    const [fila] = await base.sistema.db
      .select()
      .from(mensajesContacto)
      .where(eq(mensajesContacto.email, 'uno@example.com'));
    expect(fila).toMatchObject({ estado: 'nuevo', tipoEvento: 'meetup' });
    expect(fila?.ipHash?.length).toBe(32);
    expect(JSON.stringify(fila)).not.toContain('198.51.100.');
    const [correo] = await base.sistema.db
      .select()
      .from(enviosCorreo)
      .where(
        and(
          eq(enviosCorreo.destinatario, 'admin-contacto@example.com'),
          eq(enviosCorreo.refId, fila?.id ?? ''),
        ),
      );
    expect(correo?.tipo).toBe('nuevo_contacto');
    expect(JSON.stringify(correo?.datos)).not.toContain(DATOS.mensaje);
  });

  it('la trampa: con el campo oculto lleno responde igual y no guarda nada', async () => {
    const respuesta = await enviar({
      ...DATOS,
      email: 'robot@example.com',
      sitioWeb: 'https://spam.example.com',
    });
    expect(respuesta.statusCode).toBe(201);
    expect(
      await base.sistema.db.$count(
        mensajesContacto,
        eq(mensajesContacto.email, 'robot@example.com'),
      ),
    ).toBe(0);
  });

  it('el cuarto envío en una hora desde la misma IP responde 429', async () => {
    const misma = '203.0.113.9';
    for (let i = 0; i < 3; i++) {
      expect((await enviar({ ...DATOS, email: `limite${i}@example.com` }, misma)).statusCode).toBe(
        201,
      );
    }
    const cuarto = await enviar({ ...DATOS, email: 'limite3@example.com' }, misma);
    expect(cuarto.statusCode).toBe(429);
    expect(cuarto.json().code).toBe('DEMASIADOS_INTENTOS');
  });

  it('sin aceptar la privacidad, o con un mensaje corto, no se guarda', async () => {
    const sinAceptar = await enviar({ ...DATOS, aceptaPrivacidad: false });
    expect(sinAceptar.json().code).toBe('VALIDACION');
    const corto = await enviar({ ...DATOS, mensaje: 'Hola' });
    expect(corto.json().errors?.[0]?.field).toBe('mensaje');
  });

  it('la bandeja: soporte la ve, solo admin la cambia; ver y cambiar quedan en la bitácora', async () => {
    await enviar({ ...DATOS, email: 'bandeja@example.com' });
    const lista = await pedir('GET', '/plataforma/contactos?estado=nuevo', soporte);
    expect(lista.statusCode).toBe(200);
    const item = lista.json().items.find((i: { nombre: string }) => i.nombre === DATOS.nombre);
    expect(item).toBeTruthy();
    expect(item.email).toBeUndefined();
    expect(lista.json().nuevos).toBeGreaterThan(0);

    const detalle = await pedir('GET', `/plataforma/contactos/${item.id}`, soporte);
    expect(detalle.json()).toMatchObject({ mensaje: DATOS.mensaje });
    expect(
      await base.sistema.db.$count(
        bitacora,
        and(eq(bitacora.accion, 'contacto.ver'), eq(bitacora.objetoId, item.id)),
      ),
    ).toBe(1);

    expect(
      (await pedir('PATCH', `/plataforma/contactos/${item.id}`, soporte, { estado: 'respondido' }))
        .statusCode,
    ).toBe(403);
    const cambio = await pedir('PATCH', `/plataforma/contactos/${item.id}`, admin, {
      estado: 'respondido',
      notaInterna: 'Le escribimos el 20/11.',
    });
    expect(cambio.statusCode).toBe(204);
    const [entrada] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.accion, 'contacto.actualizar'), eq(bitacora.objetoId, item.id)));
    expect(entrada?.antes).toEqual({ estado: 'nuevo' });
    expect(entrada?.despues).toEqual({ estado: 'respondido', nota: 'cambió' });
    expect(JSON.stringify(entrada)).not.toContain('Le escribimos');
  });
});

describe('Contacto con Turnstile (HU-410)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base, {
      turnstile: { verify: (token) => Promise.resolve(token === 'valido') },
    });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  it('sin token o con uno inválido no se guarda; con uno válido, sí', async () => {
    const enviar = (cuerpo: object, ip: string) =>
      api.app.inject({
        method: 'POST',
        url: '/api/v1/publico/contacto',
        remoteAddress: ip,
        payload: cuerpo,
      });
    expect((await enviar(DATOS, '198.51.100.201')).json().code).toBe('VERIFICACION_FALLIDA');
    expect((await enviar({ ...DATOS, turnstile: 'falso' }, '198.51.100.202')).json().code).toBe(
      'VERIFICACION_FALLIDA',
    );
    expect((await enviar({ ...DATOS, turnstile: 'valido' }, '198.51.100.203')).statusCode).toBe(
      201,
    );
  });
});
