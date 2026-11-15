import { and, eq } from 'drizzle-orm';
import { bitacora, eventos, organizaciones, outbox } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { ROLES_EVENTO } from '@pasitos/dominio';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { runV9 } from '../../pruebas/v9';

/** Crear el evento y su ciclo de vida, con PostgreSQL real (HU-205). Requiere Docker. */
describe('Eventos (HU-205)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let organizacionId: string;
  let dueno: PersonaDePrueba;
  let coorganizador: PersonaDePrueba;
  let ajena: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    const semilla = await createEventoDePrueba(base);
    organizacionId = semilla.organizacionId;
    dueno = await createPersonaConSesion(base, 'Dueña');
    await addRol(base, semilla, dueno, 'dueno');
    coorganizador = await createPersonaConSesion(base, 'Coorganizador');
    await addRol(base, semilla, coorganizador, 'coorganizador');
    ajena = await createPersonaConSesion(base, 'De otra organización');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(method: 'GET' | 'POST', url: string, quien: PersonaDePrueba, body?: object) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: quien.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  const datos = {
    nombre: 'Meetup Stellar La Paz',
    inicioAt: '2026-12-05T14:00:00Z',
    finAt: '2026-12-05T22:00:00Z',
  };

  async function createEvento(): Promise<string> {
    const respuesta = await pedir(
      'POST',
      `/organizaciones/${organizacionId}/eventos`,
      dueno,
      datos,
    );
    expect(respuesta.statusCode).toBe(201);
    return respuesta.json().id as string;
  }

  async function countBitacora(eventoId: string, accion: string) {
    return base.sistema.db.$count(
      bitacora,
      and(eq(bitacora.eventoId, eventoId), eq(bitacora.accion, accion)),
    );
  }

  it('la dueña crea un evento en borrador con slug único; los demás no pueden', async () => {
    const primero = await pedir('POST', `/organizaciones/${organizacionId}/eventos`, dueno, datos);
    const segundo = await pedir('POST', `/organizaciones/${organizacionId}/eventos`, dueno, datos);
    expect(primero.json().slug).toBe('meetup-stellar-la-paz');
    expect(segundo.json().slug).toBe('meetup-stellar-la-paz-2');
    const [evento] = await base.sistema.db
      .select()
      .from(eventos)
      .where(eq(eventos.id, primero.json().id));
    expect(evento).toMatchObject({
      estado: 'borrador',
      tipo: 'real',
      visibilidad: 'privado',
      nombrePuntos: 'puntos',
      zonaHoraria: 'America/La_Paz',
    });
    expect(await countBitacora(primero.json().id, 'evento.create')).toBe(1);

    expect(
      (await pedir('POST', `/organizaciones/${organizacionId}/eventos`, coorganizador, datos))
        .statusCode,
    ).toBe(404);
    expect(
      (await pedir('POST', `/organizaciones/${organizacionId}/eventos`, ajena, datos)).statusCode,
    ).toBe(404);
    const malas = await pedir('POST', `/organizaciones/${organizacionId}/eventos`, dueno, {
      ...datos,
      finAt: '2026-12-20T00:00:00Z',
    });
    expect(malas.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'finAt' }] });
  });

  it('Mis eventos trae mi rol; el detalle, miRol y los contadores', async () => {
    const id = await createEvento();
    const mios = await pedir('GET', '/eventos', dueno);
    expect(mios.json().items.find((e: { id: string }) => e.id === id)).toMatchObject({
      miRol: 'dueno',
    });
    expect((await pedir('GET', '/eventos', ajena)).json().items).toEqual([]);
    const detalle = await pedir('GET', `/eventos/${id}`, dueno);
    expect(detalle.json()).toMatchObject({
      miRol: 'dueno',
      estado: 'borrador',
      stellar: { contratoId: null },
      contadores: { retos: 0, pantallas: 0 },
    });
  });

  it('publicar sin completar la lista responde EVENTO_NO_PUBLICABLE con lo que falta', async () => {
    const id = await createEvento();
    const lista = await pedir('GET', `/eventos/${id}/lista-de-chequeo`, dueno);
    expect(lista.json().completa).toBe(false);
    const publicar = await pedir('POST', `/eventos/${id}/publicar`, dueno);
    expect(publicar.statusCode).toBe(422);
    expect(publicar.json()).toMatchObject({ code: 'EVENTO_NO_PUBLICABLE' });
    expect(publicar.json().meta.faltantes.map((f: { clave: string }) => f.clave)).toEqual([
      'retos',
    ]);
  });

  it('publicar con la lista completa escribe evento.publicado en outbox; dos a la vez, gana una', async () => {
    const evento = await createEventoDePrueba(base, { organizacionId });
    const [primera, segunda] = await Promise.all([
      pedir('POST', `/eventos/${evento.eventoId}/publicar`, dueno),
      pedir('POST', `/eventos/${evento.eventoId}/publicar`, dueno),
    ]);
    expect([primera.statusCode, segunda.statusCode].sort()).toEqual([200, 409]);
    const perdedora = primera.statusCode === 409 ? primera : segunda;
    expect(perdedora.json()).toMatchObject({
      code: 'TRANSICION_NO_PERMITIDA',
      meta: { estado: 'publicado' },
    });
    const avisos = await base.sistema.db
      .select()
      .from(outbox)
      .where(and(eq(outbox.eventoId, evento.eventoId), eq(outbox.tipo, 'evento.publicado')));
    expect(avisos).toHaveLength(1);
    expect(await countBitacora(evento.eventoId, 'evento.publish')).toBe(1);
    const [fila] = await base.sistema.db
      .select()
      .from(eventos)
      .where(eq(eventos.id, evento.eventoId));
    expect(fila?.publicadoAt).toBeInstanceOf(Date);
    expect(fila?.publicadoPor).toBeTruthy();
  });

  it('abrir sin contrato: EVENTO_SIN_CONTRATO; con contrato, en curso; pausar y reanudar', async () => {
    const evento = await createEventoDePrueba(base, { organizacionId });
    await pedir('POST', `/eventos/${evento.eventoId}/publicar`, dueno);
    expect((await pedir('POST', `/eventos/${evento.eventoId}/abrir`, dueno)).json().code).toBe(
      'EVENTO_SIN_CONTRATO',
    );
    await base.sistema.db
      .update(eventos)
      .set({ contratoId: 'C'.repeat(56) })
      .where(eq(eventos.id, evento.eventoId));
    expect((await pedir('POST', `/eventos/${evento.eventoId}/abrir`, dueno)).json().estado).toBe(
      'en_curso',
    );
    expect((await pedir('POST', `/eventos/${evento.eventoId}/pausar`, dueno)).json().estado).toBe(
      'pausado',
    );
    expect((await pedir('POST', `/eventos/${evento.eventoId}/reanudar`, dueno)).json().estado).toBe(
      'en_curso',
    );
    expect((await pedir('POST', `/eventos/${evento.eventoId}/reanudar`, dueno)).json().code).toBe(
      'TRANSICION_NO_PERMITIDA',
    );
    for (const accion of ['evento.open', 'evento.pause', 'evento.resume']) {
      expect(await countBitacora(evento.eventoId, accion)).toBe(1);
    }
  });

  it('una organización suspendida no crea ni publica', async () => {
    const otra = await createEventoDePrueba(base);
    const duena = await createPersonaConSesion(base, 'Dueña suspendida');
    await addRol(base, otra, duena, 'dueno');
    await base.sistema.db
      .update(organizaciones)
      .set({ estado: 'suspendida' })
      .where(eq(organizaciones.id, otra.organizacionId));
    const crear = await pedir(
      'POST',
      `/organizaciones/${otra.organizacionId}/eventos`,
      duena,
      datos,
    );
    expect(crear.json()).toMatchObject({
      code: 'SIN_PERMISO',
      meta: { motivo: 'organizacion_suspendida' },
    });
    const publicar = await pedir('POST', `/eventos/${otra.eventoId}/publicar`, duena);
    expect(publicar.json()).toMatchObject({ code: 'SIN_PERMISO' });
  });

  it('V9 sobre las rutas reales del evento y la bitácora', async () => {
    const evento: EventoDePrueba = await createEventoDePrueba(base);
    const actores = [];
    for (const rol of ROLES_EVENTO) {
      const persona = await createPersonaConSesion(base, `V9 ${rol}`);
      await addRol(base, evento, persona, rol, {
        pantallas: rol === 'operador_stand' ? [evento.pantallaId] : [],
      });
      actores.push({ nombre: rol, cookie: persona.cookie, rol });
    }
    actores.push({ nombre: 'ajena', cookie: ajena.cookie, rol: null });
    const { resultados, rutas } = await runV9(api.app, actores, {
      eventoId: evento.eventoId,
      recursos: { retos: evento.retoId, pantallas: evento.pantallaId },
    });
    expect(rutas).toBeGreaterThanOrEqual(7);
    expect(resultados.filter((r) => r.esperado !== r.obtenido)).toEqual([]);
  }, 60_000);
});
