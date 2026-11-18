import { and, eq } from 'drizzle-orm';
import { asistentes, bitacora, checkIns, eventos, movimientos, saldos } from '@pasitos/db';
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
import { buildQrEntrada, FRANJA_ENTRADA_MS } from '../acceso/entrada';

/** El check-in en la puerta (HU-301) con PostgreSQL real. Requiere Docker. */
describe('Check-in (HU-301)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  let mesa: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ puntosCheckIn: 10 })
      .where(eq(eventos.id, evento.eventoId));
    dueno = await createPersonaConSesion(base, 'Diana Dueña');
    registrador = await createPersonaConSesion(base, 'Luis Condori');
    mesa = await createPersonaConSesion(base, 'Omar Mesa');
    await addRol(base, evento, dueno, 'dueno');
    await addRol(base, evento, registrador, 'registrador');
    await addRol(base, evento, mesa, 'operador_mesa');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function newAsistente(nombre: string, email: string | null = null) {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre,
      email,
      estado: 'registrado',
    });
    return id;
  }

  function post(
    url: string,
    persona: PersonaDePrueba,
    cuerpo: object,
    clave: string | null = uuidv7(),
  ) {
    return api.app.inject({
      method: 'POST',
      url: `/api/v1${url}`,
      headers: {
        cookie: persona.cookie,
        'content-type': 'application/json',
        ...(clave ? { 'idempotency-key': clave } : {}),
      },
      payload: JSON.stringify(cuerpo),
    });
  }

  function get(url: string, persona: PersonaDePrueba) {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1${url}`,
      headers: { cookie: persona.cookie },
    });
  }

  async function getQr(asistenteId: string, ahoraMs = api.reloj.now().getTime()) {
    const [fila] = await base.sistema.db
      .select({ llave: eventos.llaveEntradas })
      .from(eventos)
      .where(eq(eventos.id, evento.eventoId));
    return buildQrEntrada(fila?.llave ?? Buffer.alloc(32), asistenteId, ahoraMs).qr;
  }

  it('escanear Mi entrada da la ficha; marcar presente suma la bienvenida y queda en la bitácora', async () => {
    const id = await newAsistente('Valeria Quispe', 'valeria@example.com');
    const ficha = await post(
      `/eventos/${evento.eventoId}/puerta/escanear-entrada`,
      registrador,
      { qr: await getQr(id) },
      null,
    );
    expect(ficha.statusCode).toBe(200);
    expect(ficha.json()).toMatchObject({
      id,
      nombre: 'Valeria Quispe',
      email: 'va•••@example.com',
      estado: 'registrado',
      checkIn: null,
      dispositivo: null,
    });
    expect(ficha.body).not.toMatch(/huella|"ip"/);

    const hecho = await post(`/asistentes/${id}/check-in`, registrador, {
      metodo: 'escaneo_entrada',
    });
    expect(hecho.statusCode).toBe(201);
    expect(hecho.json()).toMatchObject({
      estado: 'presente',
      saldo: 10,
      checkIn: { por: 'Luis C.' },
    });
    const [checkIn] = await base.sistema.db
      .select()
      .from(checkIns)
      .where(eq(checkIns.asistenteId, id));
    expect(checkIn).toMatchObject({
      metodo: 'escaneo_entrada',
      registradorId: registrador.usuarioId,
    });
    const [fila] = await base.sistema.db
      .select({ accion: bitacora.accion, actor: bitacora.actorNombre })
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, id), eq(bitacora.accion, 'asistente.check_in')));
    expect(fila).toEqual({ accion: 'asistente.check_in', actor: 'Luis Condori' });
  });

  it('un segundo check-in dice quién y cuándo, y no duplica; el doble toque devuelve lo mismo', async () => {
    const id = await newAsistente('Rosa Doble');
    const clave = uuidv7();
    const primero = await post(
      `/asistentes/${id}/check-in`,
      registrador,
      { metodo: 'busqueda' },
      clave,
    );
    const repetido = await post(
      `/asistentes/${id}/check-in`,
      registrador,
      { metodo: 'busqueda' },
      clave,
    );
    expect(repetido.statusCode).toBe(201);
    expect(repetido.json()).toEqual(primero.json());

    const otro = await post(`/asistentes/${id}/check-in`, dueno, { metodo: 'busqueda' });
    expect(otro.statusCode).toBe(409);
    expect(otro.json()).toMatchObject({ code: 'CHECK_IN_YA_HECHO', meta: { por: 'Luis C.' } });
    const filas = await base.sistema.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.asistenteId, id), eq(movimientos.tipo, 'checkin')));
    expect(filas).toHaveLength(1);
  });

  it('la tarjeta impresa: su QR fijo sirve para el check-in en la puerta', async () => {
    const id = await newAsistente('Sin Celular');
    const tarjeta = await get(`/asistentes/${id}/tarjeta`, registrador);
    expect(tarjeta.statusCode).toBe(200);
    expect(tarjeta.json()).toMatchObject({ nombre: 'Sin Celular', evento: 'Evento de prueba' });
    const ficha = await post(
      `/eventos/${evento.eventoId}/puerta/escanear-entrada`,
      registrador,
      { qr: tarjeta.json().qr },
      null,
    );
    expect(ficha.json()).toMatchObject({ id, nombre: 'Sin Celular' });
  });

  it('una captura de Mi entrada de más de 60 s se rechaza', async () => {
    const id = await newAsistente('Hugo Captura');
    const vieja = await getQr(id, api.reloj.now().getTime() - 2 * FRANJA_ENTRADA_MS - 1_000);
    const respuesta = await post(
      `/eventos/${evento.eventoId}/puerta/escanear-entrada`,
      registrador,
      { qr: vieja },
      null,
    );
    expect(respuesta.json()).toMatchObject({
      code: 'QR_ASISTENTE_VENCIDO',
      detail: 'Pídele que abra Mi entrada de nuevo.',
    });
    const ajeno = await post(
      `/eventos/${evento.eventoId}/puerta/escanear-entrada`,
      registrador,
      { qr: 'PX1.otra-cosa' },
      null,
    );
    expect(ajeno.json().code).toBe('QR_INVALIDO');
  });

  it('deshacer pide motivo, resta la bienvenida y, si ya la gastó, no deja; R no puede', async () => {
    const id = await newAsistente('Eva Deshacer');
    await post(`/asistentes/${id}/check-in`, registrador, { metodo: 'busqueda' });

    expect(
      (await post(`/asistentes/${id}/check-in/anular`, registrador, { motivo: 'Me equivoqué' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await post(`/asistentes/${id}/check-in/anular`, dueno, { motivo: 'no' })).json().code,
    ).toBe('VALIDACION');

    const deshecho = await post(`/asistentes/${id}/check-in/anular`, dueno, {
      motivo: 'Marqué a la persona equivocada',
    });
    expect(deshecho.statusCode).toBe(200);
    expect(deshecho.json()).toMatchObject({ estado: 'registrado', saldo: 0, checkIn: null });

    // Otra vez presente, y gasta la bienvenida (simulado: el saldo baja a 0 por un canje).
    await post(`/asistentes/${id}/check-in`, registrador, { metodo: 'busqueda' });
    await base.sistema.db.update(saldos).set({ puntos: 0 }).where(eq(saldos.asistenteId, id));
    const sinSaldo = await post(`/asistentes/${id}/check-in/anular`, dueno, {
      motivo: 'Marqué a la persona equivocada',
    });
    expect(sinSaldo.statusCode).toBe(409);
    expect(sinSaldo.json()).toMatchObject({
      code: 'SALDO_INSUFICIENTE',
      detail: 'Ya gastó los puntos de bienvenida. Anula primero su canje.',
    });
  });

  it('sin Idempotency-Key no marca; un asistente quitado de la lista tampoco', async () => {
    const id = await newAsistente('Gabi Sin Clave');
    expect(
      (await post(`/asistentes/${id}/check-in`, registrador, { metodo: 'busqueda' }, null)).json()
        .code,
    ).toBe('VALIDACION');
    await base.sistema.db
      .update(asistentes)
      .set({ estado: 'cancelado' })
      .where(eq(asistentes.id, id));
    expect(
      (await post(`/asistentes/${id}/check-in`, registrador, { metodo: 'busqueda' })).json().code,
    ).toBe('ASISTENTE_CANCELADO');
  });

  it('el operador de mesa no entra a la puerta', async () => {
    const id = await newAsistente('Ivo Permiso');
    expect((await get(`/eventos/${evento.eventoId}/puerta`, mesa)).statusCode).toBe(403);
    expect(
      (await post(`/asistentes/${id}/check-in`, mesa, { metodo: 'busqueda' })).statusCode,
    ).toBe(403);
    expect((await get(`/asistentes/${id}/ficha`, mesa)).statusCode).toBe(403);
  });

  it('el resumen cuenta presentes de la lista', async () => {
    const respuesta = await get(`/eventos/${evento.eventoId}/puerta`, registrador);
    expect(respuesta.statusCode).toBe(200);
    const resumen = respuesta.json();
    expect(resumen.presentes).toBeGreaterThanOrEqual(2);
    expect(resumen.total).toBeGreaterThan(resumen.presentes);
    // El evento de prueba trae un aviso No fui yo abierto (para V9).
    expect(resumen).toMatchObject({ registrosRestantes: null, avisosNoFuiYo: 1 });
  });

  it('el evento en cada estado: publicado sí, borrador no', async () => {
    const id = await newAsistente('Lia Estados');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'publicado' })
      .where(eq(eventos.id, evento.eventoId));
    expect(
      (await post(`/asistentes/${id}/check-in`, registrador, { metodo: 'busqueda' })).statusCode,
    ).toBe(201);
    const otro = await newAsistente('Mia Estados');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'borrador' })
      .where(eq(eventos.id, evento.eventoId));
    expect(
      (await post(`/asistentes/${otro}/check-in`, registrador, { metodo: 'busqueda' })).json().code,
    ).toBe('EVENTO_NO_ACTIVO');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'cerrado' })
      .where(eq(eventos.id, evento.eventoId));
    expect(
      (await post(`/asistentes/${otro}/check-in`, registrador, { metodo: 'busqueda' })).json().code,
    ).toBe('EVENTO_CERRADO');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'en_curso' })
      .where(eq(eventos.id, evento.eventoId));
  });
});
