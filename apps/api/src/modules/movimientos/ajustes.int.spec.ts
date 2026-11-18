import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  asistentes,
  bitacora,
  canjeItems,
  canjes,
  eventos,
  mesas,
  movimientos,
  notasMovimiento,
  premios,
  retos,
  saldos,
  withOrganizacion,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { LibroRepository, LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Ajustes, retos otorgados y anular canjes (HU-317). Requiere Docker. */
describe('Ajustes y anulaciones (HU-317)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let coorganizadora: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  const libro = new LibroService(new LibroRepository());

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ topeAjuste: 50, retosRequierenCheckIn: false })
      .where(eq(eventos.id, evento.eventoId));
    coorganizadora = await createPersonaConSesion(base, 'Carla Coorganiza');
    registrador = await createPersonaConSesion(base, 'Luis Condori');
    await addRol(base, evento, coorganizadora, 'coorganizador');
    await addRol(base, evento, registrador, 'registrador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function newAsistente(saldo = 0, usuarioId: string | null = null) {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${id.slice(-5)}`,
      estado: 'presente',
      usuarioId,
    });
    if (saldo !== 0) {
      await base.sistema.db.update(saldos).set({ puntos: saldo }).where(eq(saldos.asistenteId, id));
    }
    const [fila] = await base.sistema.db
      .select({ codigo: asistentes.codigoAsistente })
      .from(asistentes)
      .where(eq(asistentes.id, id));
    return { id, codigo: fila?.codigo ?? '' };
  }

  function post(url: string, persona: PersonaDePrueba, cuerpo: object, clave = uuidv7()) {
    return api.app.inject({
      method: 'POST',
      url: `/api/v1${url}`,
      headers: {
        cookie: persona.cookie,
        'content-type': 'application/json',
        'idempotency-key': clave,
      },
      payload: JSON.stringify(cuerpo),
    });
  }

  it('ajustar: con motivo; el libro guarda solo la categoría y el texto queda aparte', async () => {
    const { id } = await newAsistente();
    const respuesta = await post(`/asistentes/${id}/ajustes`, coorganizadora, {
      puntos: 20,
      motivo: { tipo: 'otro', texto: 'Se le cayó el celular en la charla' },
    });
    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json()).toMatchObject({ puntos: 20, saldo: 20 });
    const [mov] = await base.sistema.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.asistenteId, id), eq(movimientos.tipo, 'ajuste')));
    expect(mov).toMatchObject({
      motivo: 'Otro',
      autorId: coorganizadora.usuarioId,
      origen: 'equipo',
    });
    const [nota] = await base.sistema.db
      .select()
      .from(notasMovimiento)
      .where(eq(notasMovimiento.movimientoId, mov?.id ?? ''));
    expect(nota?.texto).toBe('Se le cayó el celular en la charla');
    const [fila] = await base.sistema.db
      .select({ despues: bitacora.despues })
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, id), eq(bitacora.accion, 'puntos.ajustar')));
    expect(fila?.despues).toMatchObject({ puntos: 20, motivo: 'Otro' });
  });

  it('más que el tope, a uno mismo, restar más que el saldo, o siendo registrador: no', async () => {
    const { id } = await newAsistente(10);
    const tope = await post(`/asistentes/${id}/ajustes`, coorganizadora, {
      puntos: 51,
      motivo: { tipo: 'compensacion' },
    });
    expect(tope.json().code).toBe('VALIDACION');
    const restar = await post(`/asistentes/${id}/ajustes`, coorganizadora, {
      puntos: -20,
      motivo: { tipo: 'correccion' },
    });
    expect(restar.json().code).toBe('SALDO_INSUFICIENTE');
    const propio = await newAsistente(0, coorganizadora.usuarioId);
    const aMiMisma = await post(`/asistentes/${propio.id}/ajustes`, coorganizadora, {
      puntos: 5,
      motivo: { tipo: 'compensacion' },
    });
    expect(aMiMisma.json().code).toBe('AJUSTE_PROPIO');
    const r = await post(`/asistentes/${id}/ajustes`, registrador, {
      puntos: 5,
      motivo: { tipo: 'compensacion' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('otorgar a 10 personas con 3 cupos: 3 ok y 7 tope; y los ya completados', async () => {
    const retoId = uuidv7();
    await base.sistema.db.insert(retos).values({
      id: retoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Ayudó en el stand',
      tipo: 'otorgado',
      puntos: 15,
      topeTotal: 3,
    });
    const personas = await Promise.all(Array.from({ length: 10 }, () => newAsistente()));
    const respuesta = await post(`/retos/${retoId}/otorgamientos`, coorganizadora, {
      asistentes: personas.map((p) => p.codigo),
    });
    expect(respuesta.statusCode).toBe(200);
    const resultados = respuesta.json().resultados as { resultado: string }[];
    expect(resultados.filter((r) => r.resultado === 'ok')).toHaveLength(3);
    expect(resultados.filter((r) => r.resultado === 'tope')).toHaveLength(7);
    const otra = await post(`/retos/${retoId}/otorgamientos`, coorganizadora, {
      asistentes: [personas[0]?.codigo ?? '', 'A-9999'],
    });
    expect(otra.json().resultados).toEqual([
      { codigo: personas[0]?.codigo, resultado: expect.stringMatching(/ya_completado|tope/) },
      { codigo: 'A-9999', resultado: 'no_encontrado' },
    ]);
  });

  it('anular un canje devuelve los puntos y el stock, una sola vez', async () => {
    const { id: asistenteId } = await newAsistente(80);
    const mesaId = uuidv7();
    await base.sistema.db.insert(mesas).values({
      id: mesaId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Mesa anulaciones',
    });
    const premioId = uuidv7();
    await base.sistema.db.insert(premios).values({
      id: premioId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Taza',
      puntos: 50,
      stockTotal: 5,
      stockEntregado: 1,
    });
    const canjeId = uuidv7();
    await base.sistema.db.insert(canjes).values({
      id: canjeId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      mesaId,
      asistenteId,
      tokenHash: randomBytes(32),
      comprobante: 'C-4821',
      totalPuntos: 50,
      estado: 'confirmado',
      expiraAt: new Date(),
    });
    await base.sistema.db.insert(canjeItems).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      canjeId,
      premioId,
      cantidad: 1,
      puntosUnitarios: 50,
    });
    const { movimiento } = await withOrganizacion(base.app.db, evento.organizacionId, (tx) =>
      libro.addMovimiento(tx, {
        eventoId: evento.eventoId,
        asistenteId,
        tipo: 'canje',
        origen: 'asistente',
        puntos: -50,
        canjeId,
      }),
    );
    await base.sistema.db
      .update(canjes)
      .set({ movimientoId: movimiento.id })
      .where(eq(canjes.id, canjeId));

    const buscado = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/canjes?q=c-4821`,
      headers: { cookie: coorganizadora.cookie },
    });
    expect(buscado.json().items[0]).toMatchObject({ id: canjeId, estado: 'confirmado' });

    const anulado = await post(`/canjes/${canjeId}/anular`, coorganizadora, {
      motivo: 'Lo cobró dos veces por error',
    });
    expect(anulado.statusCode).toBe(200);
    expect(anulado.json()).toMatchObject({ estado: 'anulado', saldo: 80 });
    const [premio] = await base.sistema.db.select().from(premios).where(eq(premios.id, premioId));
    expect(premio?.stockEntregado).toBe(0);
    const otraVez = await post(`/canjes/${canjeId}/anular`, coorganizadora, {
      motivo: 'Lo cobró dos veces por error',
    });
    expect(otraVez.json().code).toBe('YA_ANULADO');

    const lista = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/ajustes?tipo=anulacion`,
      headers: { cookie: coorganizadora.cookie },
    });
    expect(lista.json().items[0]).toMatchObject({
      tipo: 'anulacion',
      puntos: 50,
      autor: { nombre: 'Carla C.' },
    });
  });
});
