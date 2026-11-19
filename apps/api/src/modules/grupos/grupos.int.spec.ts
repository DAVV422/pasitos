import { and, eq } from 'drizzle-orm';
import {
  asistentes,
  bitacora,
  canjes,
  eventos,
  invitaciones,
  mesas,
  movimientos,
  premios,
  retos,
  saldos,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import { createParLlaves, exportLlavePublica, hashCuerpo, signPedido } from '@pasitos/firmas';
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

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

interface Celular {
  readonly asistenteId: string;
  readonly codigo: string;
  readonly par: CryptoKeyPair;
  readonly cookie: string;
}

/** Grupos, retos y premios exclusivos (HU-325). Requiere Docker. */
describe('Grupos, retos y premios exclusivos (HU-325)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let duena: PersonaDePrueba;
  let mesa: string;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    duena = await createPersonaConSesion(base, 'Dora Duena');
    await addRol(base, evento, duena, 'dueno');
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(mesas).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Mesa VIP',
      estado: 'activa',
      sessionTokenHash: hash,
    });
    mesa = `px_terminal=${token}`;
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  function pedir(metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cuerpo?: object) {
    return api.app.inject({
      method: metodo,
      url: `/api/v1${url}`,
      headers: {
        cookie: duena.cookie,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      ...(cuerpo ? { payload: JSON.stringify(cuerpo) } : {}),
    });
  }

  async function newGrupo(nombre: string): Promise<string> {
    const respuesta = await pedir('POST', `/eventos/${evento.eventoId}/grupos`, { nombre });
    expect(respuesta.statusCode).toBe(201);
    return respuesta.json().id as string;
  }

  async function newCelular(saldo = 0): Promise<Celular> {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${asistenteId.slice(-5)}`,
      estado: 'presente',
    });
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(invitaciones).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId,
      tokenHash: hash,
      tokenCifrado: Buffer.from('cifrado-de-prueba'),
      estado: 'enviada',
    });
    const par = await createParLlaves();
    ip++;
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: `10.6.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'invitacion',
        token,
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    expect(respuesta.statusCode).toBe(201);
    if (saldo) {
      await base.sistema.db
        .update(saldos)
        .set({ puntos: saldo })
        .where(eq(saldos.asistenteId, asistenteId));
    }
    const [fila] = await base.sistema.db
      .select({ codigo: asistentes.codigoAsistente })
      .from(asistentes)
      .where(eq(asistentes.id, asistenteId));
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? '';
    return { asistenteId, codigo: fila?.codigo ?? '', par, cookie: `px_asistente=${cookie}` };
  }

  function app(celular: Celular, url: string) {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1/app/${url}`,
      headers: { cookie: celular.cookie },
    });
  }

  async function confirmar(celular: Celular, qr: string) {
    const token = qr.split('/app/cobro/')[1] ?? '';
    const ruta = `/api/v1/app/cobros/${token}/confirmar`;
    const clave = uuidv7();
    const pedido = {
      metodo: 'POST',
      ruta,
      clave,
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(''),
    };
    return api.app.inject({
      method: 'POST',
      url: ruta,
      headers: {
        cookie: celular.cookie,
        'idempotency-key': clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(celular.par.privateKey, pedido),
      },
    });
  }

  function cobrar(items: { premioId: string; cantidad: number }[]) {
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/mesa/cobros',
      headers: { cookie: mesa, 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      payload: JSON.stringify({ items }),
    });
  }

  it('crear, editar y agregar a mano; un grupo en uso no se borra', async () => {
    const id = await newGrupo('Prensa');
    const repetido = await pedir('POST', `/eventos/${evento.eventoId}/grupos`, {
      nombre: 'Prensa',
    });
    expect(repetido.json().errors[0].field).toBe('nombre');
    expect((await pedir('PATCH', `/grupos/${id}`, { color: 'ok' })).json()).toMatchObject({
      nombre: 'Prensa',
      color: 'ok',
    });
    const persona = await newCelular();
    const agregar = await pedir('POST', `/grupos/${id}/miembros`, {
      asistentes: [persona.codigo, persona.codigo.toLowerCase(), 'A-9999'],
    });
    expect(agregar.json()).toEqual({
      agregados: [persona.codigo],
      yaEstaban: [],
      noEncontrados: ['A-9999'],
    });
    expect(
      (await pedir('POST', `/grupos/${id}/miembros`, { asistentes: [persona.codigo] })).json()
        .yaEstaban,
    ).toEqual([persona.codigo]);
    expect((await app(persona, 'estado')).json().asistente.grupos).toEqual(['Prensa']);
    expect((await app(persona, 'mi-entrada')).json().grupos).toEqual(['Prensa']);

    const enUso = await pedir('DELETE', `/grupos/${id}`);
    expect(enUso.statusCode).toBe(409);
    expect(enUso.json().code).toBe('GRUPO_EN_USO');
    expect(
      (await pedir('DELETE', `/grupos/${id}/miembros/${persona.asistenteId}`)).statusCode,
    ).toBe(204);
    expect((await pedir('DELETE', `/grupos/${id}`)).statusCode).toBe(204);
    const acciones = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(eq(bitacora.objetoId, id));
    expect(acciones.map((a) => a.accion).sort()).toEqual([
      'grupo.agregar',
      'grupo.create',
      'grupo.delete',
      'grupo.quitar',
      'grupo.update',
    ]);
  });

  it('un reto y un premio de un grupo no aparecen para quien no es del grupo', async () => {
    const vip = await newGrupo('VIP visibilidad');
    const retoId = uuidv7();
    await base.sistema.db.insert(retos).values({
      id: retoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Charla VIP',
      tipo: 'otorgado',
      puntos: 20,
      topeTotal: 100,
      grupoId: vip,
    });
    const premioId = uuidv7();
    await base.sistema.db.insert(premios).values({
      id: premioId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Gorra VIP',
      puntos: 0,
      stockTotal: 5,
      grupoId: vip,
    });
    const [dentro, fuera] = [await newCelular(), await newCelular()];
    await pedir('POST', `/grupos/${vip}/miembros`, { asistentes: [dentro.codigo] });

    const ids = (lista: { id: string }[]) => lista.map((x) => x.id);
    expect(ids((await app(dentro, 'estado')).json().retos)).toContain(retoId);
    expect(ids((await app(dentro, 'estado')).json().premios)).toContain(premioId);
    expect(ids((await app(fuera, 'estado')).json().retos)).not.toContain(retoId);
    expect(ids((await app(fuera, 'estado')).json().premios)).not.toContain(premioId);

    const contenidoDentro = (await app(dentro, 'evento')).json();
    expect(contenidoDentro.premios.find((p: { id: string }) => p.id === premioId)).toMatchObject({
      puntos: 0,
      grupo: { nombre: 'VIP visibilidad' },
    });
    expect(ids((await app(fuera, 'evento')).json().retos)).not.toContain(retoId);
    expect(ids((await app(fuera, 'evento')).json().premios)).not.toContain(premioId);
  });

  it('el souvenir de 0 puntos: comprobante, stock, máximo por persona y un canje de 0 en el libro', async () => {
    const vip = await newGrupo('VIP souvenir');
    const premioId = uuidv7();
    await base.sistema.db.insert(premios).values({
      id: premioId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Souvenir',
      puntos: 0,
      stockTotal: 5,
      maxPorPersona: 1,
      grupoId: vip,
    });
    const [dentro, fuera] = [await newCelular(), await newCelular()];
    await pedir('POST', `/grupos/${vip}/miembros`, { asistentes: [dentro.codigo] });

    // La mesa ve el premio con su grupo.
    const catalogo = await api.app.inject({
      method: 'GET',
      url: '/api/v1/mesa/catalogo',
      headers: { cookie: mesa },
    });
    expect(catalogo.json().items.find((p: { id: string }) => p.id === premioId)).toMatchObject({
      grupo: 'VIP souvenir',
    });

    const ajeno = await cobrar([{ premioId, cantidad: 1 }]);
    const noEsDelGrupo = await confirmar(fuera, ajeno.json().qr);
    expect(noEsDelGrupo.statusCode).toBe(403);
    expect(noEsDelGrupo.json()).toMatchObject({
      code: 'SOLO_PARA_GRUPO',
      detail: 'Este premio es solo para VIP souvenir.',
    });

    const cobro = await cobrar([{ premioId, cantidad: 1 }]);
    expect(cobro.json()).toMatchObject({ total: 0, items: [{ grupo: 'VIP souvenir' }] });
    const confirmado = await confirmar(dentro, cobro.json().qr);
    expect(confirmado.statusCode).toBe(201);
    const [canje] = await base.sistema.db
      .select({ id: canjes.id, grupoId: canjes.grupoId, movimientoId: canjes.movimientoId })
      .from(canjes)
      .where(eq(canjes.asistenteId, dentro.asistenteId));
    expect(canje?.grupoId).toBe(vip);
    const [movimiento] = await base.sistema.db
      .select({ tipo: movimientos.tipo, puntos: movimientos.puntos })
      .from(movimientos)
      .where(eq(movimientos.id, canje?.movimientoId ?? ''));
    expect(movimiento).toEqual({ tipo: 'canje', puntos: 0 });

    // El máximo por persona vale también para lo gratis.
    const otraVez = await cobrar([{ premioId, cantidad: 1 }]);
    expect((await confirmar(dentro, otraVez.json().qr)).json().code).toBe('MAXIMO_POR_PERSONA');

    // Anular un canje de 0 devuelve el stock y deja una anulación de 0 en el libro.
    const anular = await api.app.inject({
      method: 'POST',
      url: `/api/v1/canjes/${canje?.id ?? ''}/anular`,
      headers: {
        cookie: duena.cookie,
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      payload: JSON.stringify({ motivo: 'Se entregó por error' }),
    });
    expect(anular.statusCode).toBe(200);
    const [premio] = await base.sistema.db
      .select({ entregado: premios.stockEntregado })
      .from(premios)
      .where(eq(premios.id, premioId));
    expect(premio?.entregado).toBe(0);
    expect(
      await base.sistema.db.$count(
        movimientos,
        and(
          eq(movimientos.asistenteId, dentro.asistenteId),
          eq(movimientos.tipo, 'anulacion'),
          eq(movimientos.anulaMovimientoId, canje?.movimientoId ?? ''),
          eq(movimientos.puntos, 0),
        ),
      ),
    ).toBe(1);
  });

  it('un premio sin grupo no puede costar 0, ni por el API ni en la base', async () => {
    const sinGrupo = await pedir('POST', `/eventos/${evento.eventoId}/premios`, {
      nombre: 'Gratis para todos',
      puntos: 0,
      stockTotal: 5,
    });
    expect(sinGrupo.statusCode).toBe(400);
    expect(sinGrupo.json().errors[0].field).toBe('puntos');
    await expect(
      base.sistema.db.insert(premios).values({
        id: uuidv7(),
        organizacionId: evento.organizacionId,
        eventoId: evento.eventoId,
        nombre: 'A escondidas',
        puntos: 0,
        stockTotal: 1,
      }),
    ).rejects.toThrow();
    const vip = await newGrupo('VIP catálogo');
    const conGrupo = await pedir('POST', `/eventos/${evento.eventoId}/premios`, {
      nombre: 'Gratis VIP',
      puntos: 0,
      stockTotal: 5,
      grupoId: vip,
    });
    expect(conGrupo.statusCode).toBe(201);
    expect(conGrupo.json()).toMatchObject({ puntos: 0, grupoId: vip });
  });

  it('el QR de registro de un grupo deja a la persona en el grupo', async () => {
    const vip = await newGrupo('VIP del QR');
    await base.sistema.db
      .update(eventos)
      .set({ autoregistroActivo: true })
      .where(eq(eventos.id, evento.eventoId));
    const qr = await pedir('POST', `/eventos/${evento.eventoId}/qr-registro`, {
      tipo: 'fijo',
      nombre: 'Cartel VIP',
      confirmarRiesgo: true,
      grupoId: vip,
    });
    expect(qr.statusCode).toBe(201);
    expect(qr.json().grupoId).toBe(vip);
    const ajeno = await pedir('PATCH', `/qr-registro/${qr.json().id as string}`, {
      grupoId: uuidv7(),
    });
    expect(ajeno.json().errors[0].field).toBe('grupoId');
  });
});
