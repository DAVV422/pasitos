import { eq, sql } from 'drizzle-orm';
import { bitacora, mesas, premios } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Catálogo de canje con PostgreSQL real (HU-208). Requiere Docker. */
describe('Catálogo de canje (HU-208)', () => {
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

  const gorra = () => ({ nombre: 'Gorra', puntos: 120, stockTotal: 40, maxPorPersona: 1 });

  async function reservar(id: string, reservado: number, entregado = 0) {
    await base.sistema.db
      .update(premios)
      .set({ stockReservado: reservado, stockEntregado: entregado })
      .where(eq(premios.id, id));
  }

  it('crea premios y la lista trae lo disponible', async () => {
    const creado = await pedir('POST', `/eventos/${evento.eventoId}/premios`, gorra());
    expect(creado.statusCode).toBe(201);
    expect(creado.json()).toMatchObject({
      nombre: 'Gorra',
      disponible: 40,
      estado: 'activo',
      descripcion: null,
    });
    await reservar(creado.json().id, 3, 7);
    const lista = await pedir('GET', `/eventos/${evento.eventoId}/premios`);
    expect(lista.json().items.find((p: { id: string }) => p.id === creado.json().id)).toMatchObject(
      { stockReservado: 3, stockEntregado: 7, disponible: 30 },
    );
  });

  it('validaciones: puntos y máximo por persona fuera de rango', async () => {
    const puntos = await pedir('POST', `/eventos/${evento.eventoId}/premios`, {
      ...gorra(),
      puntos: 0,
    });
    expect(puntos.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'puntos' }] });
    const maximo = await pedir('POST', `/eventos/${evento.eventoId}/premios`, {
      ...gorra(),
      maxPorPersona: 500,
    });
    expect(maximo.json().code).toBe('VALIDACION');
  });

  it('el stock no baja de lo reservado y entregado', async () => {
    const premio = (await pedir('POST', `/eventos/${evento.eventoId}/premios`, gorra())).json();
    await reservar(premio.id, 4, 6);
    const baja = await pedir('PATCH', `/premios/${premio.id}`, { stockTotal: 9 });
    expect(baja.statusCode).toBe(422);
    expect(baja.json()).toMatchObject({ code: 'STOCK_MENOR_A_COMPROMETIDO', meta: { minimo: 10 } });
    const justo = await pedir('PATCH', `/premios/${premio.id}`, { stockTotal: 10, puntos: 90 });
    expect(justo.json()).toMatchObject({ stockTotal: 10, puntos: 90, disponible: 0 });
  });

  it('bajar el stock en paralelo con una reserva: se bloquean y el CHECK nunca se viola', async () => {
    const premio = (
      await pedir('POST', `/eventos/${evento.eventoId}/premios`, { ...gorra(), stockTotal: 10 })
    ).json();
    // Una "reserva" (fase 3) toma la fila y suma 5 mientras el panel intenta dejar el stock en 3.
    let soltar!: () => void;
    const reservaHecha = new Promise<void>((resolve) => (soltar = resolve));
    const reserva = base.sistema.db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from premios where id = ${premio.id} for update`);
      await tx
        .update(premios)
        .set({ stockReservado: sql`${premios.stockReservado} + 5` })
        .where(eq(premios.id, premio.id));
      soltar();
      await new Promise((r) => setTimeout(r, 300));
    });
    await reservaHecha;
    const baja = pedir('PATCH', `/premios/${premio.id}`, { stockTotal: 3 });
    await reserva;
    const respuesta = await baja;
    expect(respuesta.json()).toMatchObject({
      code: 'STOCK_MENOR_A_COMPROMETIDO',
      meta: { minimo: 5 },
    });
    const [fila] = await base.sistema.db.select().from(premios).where(eq(premios.id, premio.id));
    expect(fila).toMatchObject({ stockTotal: 10, stockReservado: 5 });
  });

  it('con canjes no se borra (PREMIO_CON_CANJES) y se puede ocultar; sin canjes se borra', async () => {
    const usado = (await pedir('POST', `/eventos/${evento.eventoId}/premios`, gorra())).json();
    await reservar(usado.id, 0, 1);
    const borrar = await pedir('DELETE', `/premios/${usado.id}`);
    expect(borrar.statusCode).toBe(409);
    expect(borrar.json().code).toBe('PREMIO_CON_CANJES');
    expect((await pedir('POST', `/premios/${usado.id}/ocultar`)).json().estado).toBe('oculto');
    expect((await pedir('POST', `/premios/${usado.id}/mostrar`)).json().estado).toBe('activo');

    const nuevo = (await pedir('POST', `/eventos/${evento.eventoId}/premios`, gorra())).json();
    expect((await pedir('DELETE', `/premios/${nuevo.id}`)).statusCode).toBe(204);
    expect(await base.sistema.db.$count(premios, eq(premios.id, nuevo.id))).toBe(0);
  });

  it('cada cambio deja su bitácora', async () => {
    const premio = (await pedir('POST', `/eventos/${evento.eventoId}/premios`, gorra())).json();
    await pedir('PATCH', `/premios/${premio.id}`, { puntos: 150 });
    await pedir('POST', `/premios/${premio.id}/ocultar`);
    const filas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(eq(bitacora.objetoId, premio.id));
    expect(filas.map((f) => f.accion).sort()).toEqual([
      'premio.create',
      'premio.hide',
      'premio.update',
    ]);
    expect(filas.find((f) => f.accion === 'premio.update')).toMatchObject({
      antes: { puntos: 120 },
      despues: { puntos: 150 },
    });
  });

  it('la lista de chequeo pide una mesa si hay premios activos', async () => {
    const conMesa = await pedir('GET', `/eventos/${evento.eventoId}/lista-de-chequeo`);
    expect(JSON.stringify(conMesa.json())).not.toContain('catalogo_con_mesa');
    await base.sistema.db.delete(mesas).where(eq(mesas.eventoId, evento.eventoId));
    const sinMesa = await pedir('GET', `/eventos/${evento.eventoId}/lista-de-chequeo`);
    expect(JSON.stringify(sinMesa.json())).toContain('catalogo_con_mesa');
  });
});
