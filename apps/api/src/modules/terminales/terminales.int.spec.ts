import { and, eq } from 'drizzle-orm';
import { bitacora, eventos, miembroTerminales, outbox, pantallas, tokens } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { createParLlaves, exportLlavePublica, type LlavePublicaEc } from '@pasitos/firmas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Pantallas y mesas con PostgreSQL real (HU-209). Requiere Docker. */
describe('Conectar pantallas y mesas (HU-209)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let ip = 0;

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

  /** Cada conexión desde otra IP: el límite es de 10 por minuto por IP. */
  function conectar(url: string, llavePublica?: LlavePublicaEc) {
    ip++;
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/terminales/conectar',
      remoteAddress: `10.9.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
      payload: { token: url.split('/').pop(), ...(llavePublica ? { llavePublica } : {}) },
    });
  }

  function latido(cookie: string) {
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/terminales/latido',
      headers: { cookie },
    });
  }

  function cookieDe(respuesta: { cookies: { name: string; value: string }[] }): string {
    const cookie = respuesta.cookies.find((c) => c.name === 'px_terminal');
    if (!cookie) throw new Error('Sin cookie de terminal');
    return `px_terminal=${cookie.value}`;
  }

  async function newLlave() {
    return exportLlavePublica(await createParLlaves());
  }

  async function newPantalla(nombre = 'Tablet Sala B'): Promise<string> {
    const respuesta = await pedir('POST', `/eventos/${evento.eventoId}/pantallas`, {
      nombre,
      lugarId: evento.recursos.lugares,
      pin: '4821',
    });
    expect(respuesta.statusCode).toBe(201);
    return respuesta.json().id;
  }

  async function getPantalla(id: string) {
    const lista = await pedir('GET', `/eventos/${evento.eventoId}/pantallas`);
    return lista.json().items.find((p: { id: string }) => p.id === id);
  }

  it('crea pantallas con lugar y PIN (que nunca vuelve) y mesas', async () => {
    const id = await newPantalla();
    const pantalla = await getPantalla(id);
    expect(pantalla).toMatchObject({
      nombre: 'Tablet Sala B',
      lugar: { nombre: 'Sala A' },
      estado: 'desconectada',
      conexion: 'desconectada',
      tienePin: true,
    });
    expect(JSON.stringify(pantalla)).not.toContain('4821');
    const [fila] = await base.sistema.db.select().from(pantallas).where(eq(pantallas.id, id));
    expect(fila?.pinHash).toMatch(/^\$argon2id\$/);

    const sinPin = await pedir('POST', `/eventos/${evento.eventoId}/pantallas`, {
      nombre: 'Sin PIN',
      lugarId: evento.recursos.lugares,
      pin: '12',
    });
    expect(sinPin.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'pin' }] });

    const mesa = await pedir('POST', `/eventos/${evento.eventoId}/mesas`, { nombre: 'Mesa 2' });
    expect(mesa.statusCode).toBe(201);
    const mesas = await pedir('GET', `/eventos/${evento.eventoId}/mesas`);
    expect(mesas.json().items.map((m: { nombre: string }) => m.nombre)).toContain('Mesa 2');
  });

  it('V12: cada token sirve una vez, usar uno anula el otro, y vencen', async () => {
    const id = await newPantalla();
    const conexion = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    expect(conexion.qr).toMatch(/\/sala\/conectar\/[\w-]{43}$/);
    expect(
      new Date(conexion.expiraEnlaceAt).getTime() - new Date(conexion.expiraQrAt).getTime(),
    ).toBe(24 * 3_600_000 - 2 * 60_000);
    const llave = await newLlave();
    const primera = await conectar(conexion.qr, llave);
    expect(primera.statusCode).toBe(200);
    expect(primera.json()).toMatchObject({
      tipo: 'pantalla',
      nombre: 'Tablet Sala B',
      lugar: 'Sala A',
    });
    expect((await conectar(conexion.qr, llave)).json().code).toBe('ENLACE_YA_USADO');
    expect((await conectar(conexion.enlace, llave)).json().code).toBe('ENLACE_VENCIDO');

    // Generar de nuevo revoca los anteriores; y un token vencido no sirve.
    const vieja = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    const nueva = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    expect((await conectar(vieja.enlace, llave)).json().code).toBe('ENLACE_VENCIDO');
    await base.sistema.db
      .update(tokens)
      .set({ expiraAt: new Date('2000-01-01T00:00:00Z') })
      .where(eq(tokens.refId, id));
    expect((await conectar(nueva.qr, llave)).json().code).toBe('ENLACE_VENCIDO');
  });

  it('guarda la llave de la tablet; sin llave o con una que no es de la curva, no conecta', async () => {
    const id = await newPantalla();
    const conexion = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    expect((await conectar(conexion.qr)).json()).toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'llavePublica' }],
    });
    const falsa = { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'A'.repeat(43) } as const;
    expect((await conectar(conexion.qr, falsa)).json().code).toBe('VALIDACION');
    // Los intentos fallidos no gastaron el token.
    expect((await conectar(conexion.qr, await newLlave())).statusCode).toBe(200);
    const [fila] = await base.sistema.db.select().from(pantallas).where(eq(pantallas.id, id));
    expect(fila?.llavePublica?.length).toBe(65);
    expect(fila?.estado).toBe('activa');
  });

  it('latido: en línea; desconectar la saca al instante (401) y la bitácora lo registra', async () => {
    const id = await newPantalla();
    const conexion = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    const cookie = cookieDe(await conectar(conexion.enlace, await newLlave()));
    expect((await latido(cookie)).json()).toMatchObject({ tipo: 'pantalla', id });
    expect(await getPantalla(id)).toMatchObject({
      conexion: 'en_linea',
      conectadaPor: { nombre: 'Dueña' },
    });

    expect((await pedir('DELETE', `/pantallas/${id}/conexion`)).statusCode).toBe(204);
    const despues = await latido(cookie);
    expect(despues.statusCode).toBe(401);
    expect(despues.json().code).toBe('TERMINAL_DESCONECTADA');
    expect((await getPantalla(id)).conexion).toBe('desconectada');
    const acciones = await base.sistema.db
      .select({ accion: bitacora.accion, actor: bitacora.actorNombre })
      .from(bitacora)
      .where(eq(bitacora.objetoId, id));
    expect(acciones.map((a) => a.accion).sort()).toEqual([
      'pantalla.connect',
      'pantalla.create',
      'pantalla.disconnect',
    ]);
    expect(acciones.find((a) => a.accion === 'pantalla.connect')?.actor).toBe('Dueña');
  });

  it('ya en Stellar: la misma tablet vuelve; otra pide el motivo y crea una pantalla nueva', async () => {
    const id = await newPantalla('Tablet Stand');
    const llave = await newLlave();
    const primera = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    await conectar(primera.qr, llave);
    await base.sistema.db
      .update(pantallas)
      .set({ registradaEnStellarAt: new Date() })
      .where(eq(pantallas.id, id));
    const operador = await createPersonaConSesion(base, 'Operador');
    const miembroId = await addRol(base, evento, operador, 'operador_stand', { pantallas: [id] });

    const sinMotivo = await pedir('POST', `/pantallas/${id}/conexion`);
    expect(sinMotivo.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'motivo' }] });

    // La misma tablet (misma llave): mismo número, sin pantalla nueva.
    const otraVez = (
      await pedir('POST', `/pantallas/${id}/conexion`, { motivo: 'Se reinició la tablet' })
    ).json();
    expect((await conectar(otraVez.qr, llave)).json().id).toBe(id);

    // Otra tablet: pantalla nueva con el mismo lugar y otro número; la anterior, desconectada.
    const reemplazo = (
      await pedir('POST', `/pantallas/${id}/conexion`, { motivo: 'Se rompió la tablet' })
    ).json();
    const conectada = (await conectar(reemplazo.enlace, await newLlave())).json();
    expect(conectada.id).not.toBe(id);
    expect(conectada.nombre).toBe('Tablet Stand (2)');
    const [anterior] = await base.sistema.db.select().from(pantallas).where(eq(pantallas.id, id));
    const [nueva] = await base.sistema.db
      .select()
      .from(pantallas)
      .where(eq(pantallas.id, conectada.id));
    expect(anterior).toMatchObject({ estado: 'desconectada', reemplazadaPor: conectada.id });
    expect(nueva).toMatchObject({
      motivoReemplazo: 'Se rompió la tablet',
      lugarId: anterior?.lugarId,
    });
    expect(nueva?.numero).not.toBe(anterior?.numero);
    expect(nueva?.pinHash).toBe(anterior?.pinHash);
    const [asignada] = await base.sistema.db
      .select()
      .from(miembroTerminales)
      .where(eq(miembroTerminales.miembroEventoId, miembroId ?? ''));
    expect(asignada?.pantallaId).toBe(conectada.id);
    const [registro] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, conectada.id), eq(bitacora.accion, 'pantalla.replace')));
    expect(registro?.despues).toMatchObject({ motivo: 'Se rompió la tablet' });
    expect(await getPantalla(conectada.id)).toMatchObject({ reemplazaA: id });
  });

  it('con el evento publicado, conectar una pantalla nueva la manda a register-pantallas', async () => {
    const id = await newPantalla('Tablet Hall');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'publicado' })
      .where(eq(eventos.id, evento.eventoId));
    const conexion = (await pedir('POST', `/pantallas/${id}/conexion`)).json();
    await conectar(conexion.qr, await newLlave());
    const filas = await base.sistema.db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(and(eq(outbox.eventoId, evento.eventoId), eq(outbox.tipo, 'pantalla.conectada')));
    expect(filas.some((f) => (f.payload as { pantallaId: string }).pantallaId === id)).toBe(true);
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'borrador' })
      .where(eq(eventos.id, evento.eventoId));
  });

  it('una mesa se conecta sin llave y late', async () => {
    const mesaId = evento.recursos.mesas;
    const conexion = (await pedir('POST', `/mesas/${mesaId}/conexion`)).json();
    expect(conexion.enlace).toContain('/mesa/conectar/');
    const respuesta = await conectar(conexion.enlace);
    expect(respuesta.json()).toMatchObject({ tipo: 'mesa', nombre: 'Mesa 1' });
    expect((await latido(cookieDe(respuesta))).json().tipo).toBe('mesa');
    const mesas = (await pedir('GET', `/eventos/${evento.eventoId}/mesas`)).json().items;
    expect(mesas.find((m: { id: string }) => m.id === mesaId).conexion).toBe('en_linea');
  });

  it('la lista de chequeo ve la pantalla por su lugar y cuenta las mesas', async () => {
    const chequeo = (await pedir('GET', `/eventos/${evento.eventoId}/lista-de-chequeo`)).json();
    expect(JSON.stringify(chequeo)).not.toContain('no tiene pantalla');
    expect(JSON.stringify(chequeo)).not.toContain('catalogo_con_mesa');
  });
});
