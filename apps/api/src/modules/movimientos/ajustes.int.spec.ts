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

  it('dar por cumplido un reto de foto: pide el motivo; el del carnet, no se puede (HU-412)', async () => {
    const retoId = uuidv7();
    await base.sistema.db.insert(retos).values({
      id: retoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Foto con el sponsor',
      tipo: 'foto',
      instruccionFoto: 'Saca una foto con el logo del sponsor.',
      puntos: 20,
      topeTotal: 100,
    });
    const persona = await newAsistente();
    const sinMotivo = await post(`/retos/${retoId}/otorgamientos`, coorganizadora, {
      asistentes: [persona.codigo],
    });
    expect(sinMotivo.statusCode).toBe(400);
    expect(sinMotivo.json().errors[0]).toMatchObject({ field: 'motivo' });

    const conMotivo = await post(`/retos/${retoId}/otorgamientos`, coorganizadora, {
      asistentes: [persona.codigo],
      motivo: 'No le funcionó la cámara; la sacó frente al equipo.',
    });
    expect(conMotivo.json().resultados).toEqual([{ codigo: persona.codigo, resultado: 'ok' }]);
    const [saldo] = await base.sistema.db
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, persona.id));
    expect(saldo?.puntos).toBe(20);

    const carnetId = uuidv7();
    await base.sistema.db.insert(retos).values({
      id: carnetId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Verifica tu carnet',
      tipo: 'verificacion_ci',
      puntos: 10,
      topeTotal: 100,
    });
    const carnet = await post(`/retos/${carnetId}/otorgamientos`, coorganizadora, {
      asistentes: [persona.codigo],
      motivo: 'Lo mostró en la puerta.',
    });
    expect(carnet.statusCode).toBe(400);
    expect(carnet.json().detail).toMatch(/Verificar carnet/);
  });

  async function newPremio(datos: Partial<typeof premios.$inferInsert> = {}) {
    const id = uuidv7();
    await base.sistema.db.insert(premios).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Premio ${id.slice(-4)}`,
      puntos: 30,
      stockTotal: 5,
      estado: 'activo',
      ...datos,
    });
    return id;
  }

  it('canjear un premio a mano: canje confirmado sin mesa, descuenta puntos y stock (HU-412)', async () => {
    const persona = await newAsistente(100);
    const premioId = await newPremio();
    const respuesta = await post(`/eventos/${evento.eventoId}/canjes-manuales`, coorganizadora, {
      asistenteId: persona.id,
      items: [{ premioId, cantidad: 2 }],
      motivo: 'Se le apagó el celular en la mesa.',
    });
    expect(respuesta.statusCode).toBe(201);
    const hecho = respuesta.json();
    expect(hecho).toMatchObject({ total: 60, saldo: 40 });
    expect(hecho.comprobante).toMatch(/^C-\d{4}$/);

    const [canje] = await base.sistema.db.select().from(canjes).where(eq(canjes.id, hecho.id));
    expect(canje).toMatchObject({
      estado: 'confirmado',
      mesaId: null,
      registradoPor: coorganizadora.usuarioId,
      asistenteId: persona.id,
      totalPuntos: 60,
    });
    const [premio] = await base.sistema.db
      .select({ entregado: premios.stockEntregado, reservado: premios.stockReservado })
      .from(premios)
      .where(eq(premios.id, premioId));
    expect(premio).toEqual({ entregado: 2, reservado: 0 });
    const [movimiento] = await base.sistema.db
      .select({
        tipo: movimientos.tipo,
        puntos: movimientos.puntos,
        motivo: movimientos.motivo,
        autor: movimientos.autorId,
        id: movimientos.id,
      })
      .from(movimientos)
      .where(eq(movimientos.canjeId, hecho.id));
    // En el libro (y el lote público) solo la categoría; el motivo escrito queda aparte.
    expect(movimiento).toMatchObject({
      tipo: 'canje',
      puntos: -60,
      motivo: 'Canje manual',
      autor: coorganizadora.usuarioId,
    });
    const [nota] = await base.sistema.db
      .select({ texto: notasMovimiento.texto })
      .from(notasMovimiento)
      .where(eq(notasMovimiento.movimientoId, movimiento?.id ?? ''));
    expect(nota?.texto).toBe('Se le apagó el celular en la mesa.');
    const registro = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, hecho.id), eq(bitacora.accion, 'canje.manual')));
    expect(registro).toHaveLength(1);

    // Se anula como cualquier otro canje: vuelven los puntos y el stock.
    const anulado = await post(`/canjes/${hecho.id}/anular`, coorganizadora, {
      motivo: 'Se equivocó de premio.',
    });
    expect(anulado.statusCode).toBe(200);
    const [despues] = await base.sistema.db
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, persona.id));
    expect(despues?.puntos).toBe(100);
  });

  it('canje manual: sin saldo, sin stock, más del máximo o siendo registrador, no (HU-412)', async () => {
    const persona = await newAsistente(50);
    const premioId = await newPremio({ puntos: 40, stockTotal: 1, maxPorPersona: 1 });
    const canjear = (quien: PersonaDePrueba, cantidad: number, motivo = 'Canje desde el panel.') =>
      post(`/eventos/${evento.eventoId}/canjes-manuales`, quien, {
        asistenteId: persona.id,
        items: [{ premioId, cantidad }],
        motivo,
      });
    expect((await canjear(registrador, 1)).statusCode).toBe(403);
    expect((await canjear(coorganizadora, 1, 'no')).statusCode).toBe(400);
    expect((await canjear(coorganizadora, 2)).json().code).toBe('PREMIO_AGOTADO');

    const caro = await newPremio({ puntos: 80 });
    const sinSaldo = await post(`/eventos/${evento.eventoId}/canjes-manuales`, coorganizadora, {
      asistenteId: persona.id,
      items: [{ premioId: caro, cantidad: 1 }],
      motivo: 'Canje desde el panel.',
    });
    expect(sinSaldo.json().code).toBe('SALDO_INSUFICIENTE');
    // Lo que falló no dejó nada: ni canje ni stock.
    const [intacto] = await base.sistema.db
      .select({ entregado: premios.stockEntregado })
      .from(premios)
      .where(eq(premios.id, caro));
    expect(intacto?.entregado).toBe(0);

    expect((await canjear(coorganizadora, 1)).statusCode).toBe(201);
    const otraVez = await canjear(coorganizadora, 1);
    expect(['PREMIO_AGOTADO', 'MAXIMO_POR_PERSONA']).toContain(otraVez.json().code);
  });
});
