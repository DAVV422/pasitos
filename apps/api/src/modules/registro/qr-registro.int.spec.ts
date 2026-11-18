import { and, eq } from 'drizzle-orm';
import { bitacora, eventos, pantallas, qrRegistro, registrosTecnicos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';

/** Los QR de registro (HU-319). Requiere Docker. */
describe('QR de registro (HU-319)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let duena: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  let otroRegistrador: PersonaDePrueba;
  let operadorMesa: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ autoregistroActivo: true })
      .where(eq(eventos.id, evento.eventoId));
    duena = await createPersonaConSesion(base, 'Dora Duena');
    registrador = await createPersonaConSesion(base, 'Rita Registra');
    otroRegistrador = await createPersonaConSesion(base, 'Raul Registra');
    operadorMesa = await createPersonaConSesion(base, 'Mario Mesa');
    await addRol(base, evento, duena, 'dueno');
    await addRol(base, evento, registrador, 'registrador');
    await addRol(base, evento, otroRegistrador, 'registrador');
    await addRol(base, evento, operadorMesa, 'operador_mesa');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(metodo: 'GET' | 'POST' | 'PATCH', url: string, persona = duena, cuerpo?: object) {
    return api.app.inject({
      method: metodo,
      url: `/api/v1${url}`,
      headers: {
        cookie: persona.cookie,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      ...(cuerpo ? { payload: JSON.stringify(cuerpo) } : {}),
    });
  }

  function abrir(url: string) {
    const ruta = new URL(url).pathname.replace('/app/registro/', '/api/v1/app/registro/');
    return api.app.inject({ method: 'GET', url: ruta, headers: { 'x-forwarded-for': '10.9.9.9' } });
  }

  async function newRotativo(nombre: string, extra: object = {}) {
    const respuesta = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'rotativo',
      nombre,
      muestra: 'miembro',
      usuarioId: registrador.usuarioId,
      ...extra,
    });
    expect(respuesta.statusCode).toBe(201);
    return respuesta.json() as { id: string; nombre: string };
  }

  async function getUrl(id: string, persona = registrador): Promise<string> {
    const franja = await pedir('GET', `/qr-registro/${id}/franja`, persona);
    expect(franja.statusCode).toBe(200);
    return franja.json().url as string;
  }

  it('un fijo no se guarda sin aceptar el riesgo; con el riesgo, se crea impreso', async () => {
    const sin = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'fijo',
      nombre: 'Cartel de la entrada',
    });
    expect(sin.statusCode).toBe(422);
    expect(sin.json().code).toBe('CONFIRMAR_RIESGO');
    const con = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'fijo',
      nombre: 'Cartel de la entrada',
      confirmarRiesgo: true,
    });
    expect(con.statusCode).toBe(201);
    expect(con.json()).toMatchObject({ tipo: 'fijo', muestra: 'impreso', estado: 'activo' });
    // El panel nunca recibe el token.
    const [fila] = await base.sistema.db
      .select()
      .from(qrRegistro)
      .where(eq(qrRegistro.id, con.json().id));
    expect(fila?.tokenHash).not.toBeNull();
    expect(JSON.stringify(con.json())).not.toContain('token');
  });

  it('el rotativo: la franja solo la pide quien lo tiene asignado, y vence a los 30 s más 5', async () => {
    const qr = await newRotativo('Entrada principal');
    expect((await pedir('GET', `/qr-registro/${qr.id}/franja`, otroRegistrador)).statusCode).toBe(
      403,
    );
    expect((await pedir('GET', `/qr-registro/${qr.id}/franja`, operadorMesa)).statusCode).toBe(403);
    const url = await getUrl(qr.id);
    expect(url).toMatch(/\/app\/registro\/r\/[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]{22}$/);

    const abierto = await abrir(url);
    expect(abierto.statusCode).toBe(200);
    expect(abierto.json()).toMatchObject({ qr: { nombre: 'Entrada principal' } });
    const cookie = abierto.cookies.find((c) => c.name === 'px_registro');
    expect(cookie).toMatchObject({ httpOnly: true, path: '/api/v1/app/registro' });

    // Una firma cambiada no es un QR de Pasitos.
    expect((await abrir(`${url.slice(0, -2)}AA`)).json().code).toBe('QR_REGISTRO_INVALIDO');

    api.reloj.advance(40_000);
    const vencido = await abrir(url);
    expect(vencido.statusCode).toBe(422);
    expect(vencido.json().code).toBe('QR_REGISTRO_VENCIDO');
    const rechazos = await base.sistema.db
      .select({ motivo: registrosTecnicos.motivo })
      .from(registrosTecnicos)
      .where(
        and(
          eq(registrosTecnicos.eventoId, evento.eventoId),
          eq(registrosTecnicos.momento, 'intento_fallido'),
        ),
      );
    expect(rechazos.map((r) => r.motivo)).toEqual(
      expect.arrayContaining(['qr_registro_invalido', 'qr_registro_vencido']),
    );
  });

  it('invalidar lo apaga al instante y no se deshace; *Crear otro igual* da uno nuevo', async () => {
    const fijo = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'fijo',
      nombre: 'Afiche del hall',
      confirmarRiesgo: true,
      tope: 50,
    });
    const id = fijo.json().id as string;
    const png = await pedir('GET', `/qr-registro/${id}/imprimible?formato=png`);
    expect(png.statusCode).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect(png.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    const pdf = await pedir('GET', `/qr-registro/${id}/imprimible?formato=pdf`);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.rawPayload.toString('latin1')).toContain('(Afiche del hall)');
    const descargas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, id), eq(bitacora.accion, 'qr_registro.download')));
    expect(descargas).toHaveLength(2);

    const invalidar = await pedir('POST', `/qr-registro/${id}/invalidar`, duena, {
      motivo: 'Lo fotografiaron y lo compartieron',
    });
    expect(invalidar.json().estado).toBe('invalidado');
    expect(
      (await pedir('POST', `/qr-registro/${id}/invalidar`, duena, { motivo: 'otra vez' })).json()
        .code,
    ).toBe('QR_REGISTRO_INACTIVO');
    expect((await pedir('PATCH', `/qr-registro/${id}`, duena, { tope: 80 })).statusCode).toBe(422);

    const copia = await pedir('POST', `/qr-registro/${id}/duplicar`);
    expect(copia.statusCode).toBe(201);
    expect(copia.json()).toMatchObject({
      nombre: 'Afiche del hall (2)',
      tope: 50,
      estado: 'activo',
    });
    const filas = await base.sistema.db
      .select({ id: qrRegistro.id, tokenHash: qrRegistro.tokenHash })
      .from(qrRegistro)
      .where(eq(qrRegistro.eventoId, evento.eventoId));
    const original = filas.find((f) => f.id === id);
    const nueva = filas.find((f) => f.id === copia.json().id);
    expect(nueva?.tokenHash?.equals(original?.tokenHash ?? Buffer.alloc(0))).toBe(false);
  });

  it('el tope, la vigencia y el autorregistro apagado lo dejan inactivo', async () => {
    const qr = await newRotativo('Puerta lateral', { tope: 2 });
    const url = await getUrl(qr.id);
    expect((await abrir(url)).statusCode).toBe(200);

    await base.sistema.db.update(qrRegistro).set({ registros: 2 }).where(eq(qrRegistro.id, qr.id));
    expect((await abrir(url)).json().code).toBe('QR_REGISTRO_INACTIVO');
    const lista = (await pedir('GET', `/eventos/${evento.eventoId}/qr-registro`)).json().items as {
      id: string;
      estado: string;
    }[];
    expect(lista.find((q) => q.id === qr.id)?.estado).toBe('tope_lleno');
    // Sin URL mientras no sirve: la pantalla de *Activar cuentas* dice por qué.
    const franja = (await pedir('GET', `/qr-registro/${qr.id}/franja`, registrador)).json();
    expect(franja).toMatchObject({ url: null, disponibilidad: 'tope_lleno' });

    await base.sistema.db
      .update(qrRegistro)
      .set({ registros: 0, desde: new Date(api.reloj.now().getTime() + 3_600_000) })
      .where(eq(qrRegistro.id, qr.id));
    expect((await abrir(url)).json().code).toBe('QR_REGISTRO_INACTIVO');

    await base.sistema.db.update(qrRegistro).set({ desde: null }).where(eq(qrRegistro.id, qr.id));
    await base.sistema.db
      .update(eventos)
      .set({ autoregistroActivo: false })
      .where(eq(eventos.id, evento.eventoId));
    expect((await abrir(url)).json().code).toBe('QR_REGISTRO_INACTIVO');
    await base.sistema.db
      .update(eventos)
      .set({ autoregistroActivo: true })
      .where(eq(eventos.id, evento.eventoId));
  });

  it('solo se asigna a quien puede activar cuentas; el operador de mesa no ve la lista', async () => {
    const mal = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'rotativo',
      nombre: 'De la mesa',
      muestra: 'miembro',
      usuarioId: operadorMesa.usuarioId,
    });
    expect(mal.statusCode).toBe(400);
    expect(mal.json().errors[0].field).toBe('usuarioId');
    expect(
      (await pedir('GET', `/eventos/${evento.eventoId}/qr-registro`, operadorMesa)).statusCode,
    ).toBe(403);
    const mios = await pedir('GET', `/eventos/${evento.eventoId}/qr-registro/mios`, registrador);
    expect(mios.json().items.length).toBeGreaterThan(0);
    const repetido = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'rotativo',
      nombre: 'Entrada principal',
      muestra: 'miembro',
      usuarioId: registrador.usuarioId,
    });
    expect(repetido.json().errors[0].field).toBe('nombre');
  });

  it('la tablet en modo Registro muestra el QR del servidor y vuelve a los retos al invalidarlo', async () => {
    const { token, hash } = createTokenAleatorio();
    const pantallaId = uuidv7();
    await base.sistema.db.insert(pantallas).values({
      id: pantallaId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Tablet de registro',
      estado: 'activa',
      sessionTokenHash: hash,
    });
    const cookieTablet = `px_terminal=${token}`;
    const qr = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'rotativo',
      nombre: 'Tablet del hall',
      muestra: 'pantalla',
      pantallaId,
    });
    expect(qr.statusCode).toBe(201);
    const otra = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, duena, {
      tipo: 'rotativo',
      nombre: 'Otra en la misma tablet',
      muestra: 'pantalla',
      pantallaId,
    });
    expect(otra.json().errors[0].field).toBe('pantallaId');

    const tablet = (url: string) =>
      api.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookieTablet } });
    expect((await tablet('/sala/estado')).json()).toMatchObject({
      modo: 'registro',
      registro: { nombre: 'Tablet del hall', registros: 0 },
    });
    const { franja } = (await tablet('/sala/registro/franja')).json();
    expect((await abrir(franja.url)).statusCode).toBe(200);
    // La tablet no puede pedir la franja de un QR de una persona.
    expect(
      (await pedir('GET', `/qr-registro/${qr.json().id}/franja`, registrador)).statusCode,
    ).toBe(403);

    await pedir('POST', `/qr-registro/${qr.json().id}/invalidar`, duena, {
      motivo: 'Cambio de lugar',
    });
    expect((await tablet('/sala/estado')).json().modo).toBe('reto');
    expect((await tablet('/sala/registro/franja')).json().franja).toBeNull();
  });
});
