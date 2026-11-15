import { and, eq } from 'drizzle-orm';
import { bitacora, eventos, outbox, retos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Retos con PostgreSQL real (HU-207). Requiere Docker. */
describe('Retos (HU-207)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña');
    await addRol(base, evento, dueno, 'dueno');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: object) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: dueno.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  const charla = () => ({
    nombre: 'Charla de apertura',
    tipo: 'qr',
    modoQr: 'por_tiempo',
    rotacionSegundos: 15,
    puntos: 20,
    topeTotal: 200,
    lugarId: evento.recursos.lugares,
    disponibleDesde: '2026-12-01T13:00:00Z',
    disponibleHasta: '2026-12-01T14:00:00Z',
  });

  async function setEstado(estado: string) {
    await base.sistema.db.update(eventos).set({ estado }).where(eq(eventos.id, evento.eventoId));
  }

  async function countOutbox(retoId: string) {
    const filas = await base.sistema.db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(and(eq(outbox.eventoId, evento.eventoId), eq(outbox.tipo, 'reto.cambiado')));
    return filas.filter((f) => (f.payload as { retoId: string }).retoId === retoId).length;
  }

  it('crea retos de QR (por tiempo y de un uso) y otorgados, con número asignado por la base', async () => {
    const qr = await pedir('POST', `/eventos/${evento.eventoId}/retos`, charla());
    expect(qr.statusCode).toBe(201);
    expect(qr.json()).toMatchObject({
      nombre: 'Charla de apertura',
      rotacionSegundos: 15,
      estado: 'activo',
    });
    expect(qr.json().numero).toBeGreaterThan(0);
    const unUso = await pedir('POST', `/eventos/${evento.eventoId}/retos`, {
      ...charla(),
      nombre: 'Stand',
      modoQr: 'un_uso',
    });
    expect(unUso.json().modoQr).toBe('un_uso');
    const otorgado = await pedir('POST', `/eventos/${evento.eventoId}/retos`, {
      nombre: 'Pregunta en la charla',
      tipo: 'otorgado',
      puntos: 5,
      topeTotal: 30,
    });
    expect(otorgado.statusCode).toBe(201);
    const lista = await pedir('GET', `/eventos/${evento.eventoId}/retos`);
    expect(lista.json().items.find((r: { id: string }) => r.id === qr.json().id)).toMatchObject({
      lugar: { nombre: 'Sala A' },
      tienePantalla: true,
      entregados: 0,
      registradoEnStellar: false,
    });
  });

  it('validaciones: QR sin lugar, horario fuera del evento, puntos fuera de rango', async () => {
    const sinLugar = await pedir('POST', `/eventos/${evento.eventoId}/retos`, {
      ...charla(),
      lugarId: null,
    });
    expect(sinLugar.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'lugarId' }] });
    const fuera = await pedir('POST', `/eventos/${evento.eventoId}/retos`, {
      ...charla(),
      disponibleDesde: '2027-01-01T10:00:00Z',
      disponibleHasta: '2027-01-01T11:00:00Z',
    });
    expect(fuera.json()).toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'disponibleDesde' }],
    });
    const puntos = await pedir('POST', `/eventos/${evento.eventoId}/retos`, {
      ...charla(),
      puntos: 5000,
    });
    expect(puntos.json().code).toBe('VALIDACION');
  });

  it('en borrador el tope baja libre y el reto se borra; publicado, el tope solo sube', async () => {
    const reto = (await pedir('POST', `/eventos/${evento.eventoId}/retos`, charla())).json();
    expect((await pedir('PATCH', `/retos/${reto.id}`, { topeTotal: 50 })).json().topeTotal).toBe(
      50,
    );

    await setEstado('publicado');
    const baja = await pedir('PATCH', `/retos/${reto.id}`, { topeTotal: 40 });
    expect(baja.statusCode).toBe(422);
    expect(baja.json()).toMatchObject({ code: 'TOPE_NO_BAJA', meta: { tope: 50 } });
    expect(await countOutbox(reto.id)).toBe(0);

    await base.sistema.db
      .update(retos)
      .set({ registradoEnStellarAt: new Date() })
      .where(eq(retos.id, reto.id));
    const sube = await pedir('PATCH', `/retos/${reto.id}`, { topeTotal: 80 });
    expect(sube.json()).toMatchObject({ topeTotal: 80, registradoEnStellar: false });
    expect(await countOutbox(reto.id)).toBe(1);
    // Cambiar los puntos vale para lo que venga y no toca el contrato.
    expect((await pedir('PATCH', `/retos/${reto.id}`, { puntos: 30 })).json().puntos).toBe(30);
    expect(await countOutbox(reto.id)).toBe(1);
    await setEstado('borrador');
  });

  it('crear un reto con el evento publicado lo manda a sync-retos', async () => {
    await setEstado('en_curso');
    const nuevo = (
      await pedir('POST', `/eventos/${evento.eventoId}/retos`, {
        ...charla(),
        nombre: 'Reto de última hora',
      })
    ).json();
    expect(await countOutbox(nuevo.id)).toBe(1);
    await setEstado('borrador');
  });

  it('borrar: con participaciones, RETO_CON_PARTICIPACIONES; publicado sin ellas, se desactiva', async () => {
    const usado = (await pedir('POST', `/eventos/${evento.eventoId}/retos`, charla())).json();
    await base.sistema.db.update(retos).set({ entregados: 3 }).where(eq(retos.id, usado.id));
    expect((await pedir('DELETE', `/retos/${usado.id}`)).json().code).toBe(
      'RETO_CON_PARTICIPACIONES',
    );
    // Con 3 entregados, el tope no puede quedar en menos.
    expect((await pedir('PATCH', `/retos/${usado.id}`, { topeTotal: 2 })).json()).toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'topeTotal' }],
    });

    const borrador = (await pedir('POST', `/eventos/${evento.eventoId}/retos`, charla())).json();
    expect((await pedir('DELETE', `/retos/${borrador.id}`)).json()).toEqual({ desactivado: false });
    expect(await base.sistema.db.$count(retos, eq(retos.id, borrador.id))).toBe(0);

    await setEstado('publicado');
    const publicado = (await pedir('POST', `/eventos/${evento.eventoId}/retos`, charla())).json();
    expect((await pedir('DELETE', `/retos/${publicado.id}`)).json()).toEqual({ desactivado: true });
    const [fila] = await base.sistema.db.select().from(retos).where(eq(retos.id, publicado.id));
    expect(fila?.estado).toBe('desactivado');
    expect((await pedir('POST', `/retos/${publicado.id}/activar`)).json().estado).toBe('activo');
    await setEstado('borrador');
  });

  it('cada cambio deja su bitácora con antes y después', async () => {
    const reto = (await pedir('POST', `/eventos/${evento.eventoId}/retos`, charla())).json();
    await pedir('PATCH', `/retos/${reto.id}`, { nombre: 'Charla de cierre' });
    const [fila] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, reto.id), eq(bitacora.accion, 'reto.update')));
    expect(fila).toMatchObject({
      antes: { nombre: 'Charla de apertura' },
      despues: { nombre: 'Charla de cierre' },
    });
  });

  it('un lugar que usa un reto no se borra', async () => {
    const respuesta = await pedir('DELETE', `/lugares/${evento.recursos.lugares}`);
    expect(respuesta.json().code).toBe('LUGAR_EN_USO');
    expect(respuesta.json().meta.usadoPor.some((u: { tipo: string }) => u.tipo === 'reto')).toBe(
      true,
    );
  });
});
