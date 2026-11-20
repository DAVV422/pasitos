import { and, eq } from 'drizzle-orm';
import {
  asistentes,
  bitacora,
  canjeItems,
  canjes,
  enviosCorreo,
  eventos,
  invitaciones,
  movimientos,
  outbox,
  premios,
  qrRegistro,
  saldos,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Cerrar el evento (HU-401), con PostgreSQL real. Requiere Docker. */
describe('Cerrar el evento (HU-401)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let dueno: PersonaDePrueba;
  let coorganizador: PersonaDePrueba;
  const libro = new LibroService();

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña cierre');
    coorganizador = await createPersonaConSesion(base, 'Coorganizador cierre');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  function pedir(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    quien: PersonaDePrueba,
    body?: object,
  ) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: quien.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  /** Un evento en curso, con contrato, la dueña y un coorganizador. */
  async function newEvento(estado = 'en_curso', conContrato = true): Promise<EventoDePrueba> {
    const evento = await createEventoDePrueba(base, { estado });
    if (conContrato) {
      await base.sistema.db
        .update(eventos)
        .set({ contratoId: 'C'.repeat(56) })
        .where(eq(eventos.id, evento.eventoId));
    }
    await addRol(base, evento, dueno, 'dueno');
    await addRol(base, evento, coorganizador, 'coorganizador');
    return evento;
  }

  async function newAsistenteConSaldo(evento: EventoDePrueba, puntos: number): Promise<string> {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Asistente ${id.slice(-4)}`,
    });
    if (puntos > 0) {
      await base.sistema.db.transaction((tx) =>
        libro.addMovimiento(tx, {
          eventoId: evento.eventoId,
          asistenteId: id,
          tipo: 'checkin',
          origen: 'equipo',
          puntos,
        }),
      );
    }
    return id;
  }

  async function getSaldo(asistenteId: string) {
    const [fila] = await base.sistema.db
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, asistenteId));
    return fila?.puntos;
  }

  it('cerrar: vencen los saldos, se cancelan los cobros y el stock vuelve; queda en la bitácora', async () => {
    const evento = await newEvento();
    const conSaldo = await newAsistenteConSaldo(evento, 120);
    const sinSaldo = await newAsistenteConSaldo(evento, 0);
    // Un cobro pendiente que reservó 2 tazas.
    const premioId = evento.recursos.premios;
    await base.sistema.db
      .update(premios)
      .set({ stockReservado: 2 })
      .where(eq(premios.id, premioId));
    await base.sistema.db.insert(canjeItems).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      canjeId: evento.recursos.canjes,
      premioId,
      cantidad: 2,
      puntosUnitarios: 25,
    });
    // Una invitación enviada con su correo en cola.
    const invitacionId = uuidv7();
    await base.sistema.db.insert(invitaciones).values({
      id: invitacionId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId: sinSaldo,
      tokenHash: Buffer.from(uuidv7()),
      tokenCifrado: Buffer.from('cifrado-de-prueba'),
      estado: 'enviada',
    });
    await base.sistema.db.insert(enviosCorreo).values({
      id: uuidv7(),
      tipo: 'invitacion_evento',
      prioridad: 4,
      destinatario: 'invitada@example.com',
      datos: {},
      programadoPara: new Date(),
      refId: invitacionId,
    });

    const vista = await pedir('GET', `/eventos/${evento.eventoId}/cierre/vista-previa`, dueno);
    expect(vista.json()).toMatchObject({
      personasConSaldo: 1,
      puntosSinUsar: 120,
      cobrosPendientes: 1,
    });

    const cierre = await pedir('POST', `/eventos/${evento.eventoId}/cerrar`, dueno, {
      confirmacion: ' cerrar ',
    });
    expect(cierre.statusCode).toBe(202);
    expect(cierre.json()).toMatchObject({
      estado: 'cerrado',
      vencimientos: 1,
      puntosVencidos: 120,
      cobrosCancelados: 1,
    });

    expect(await getSaldo(conSaldo)).toBe(0);
    const [vencimiento] = await base.sistema.db
      .select()
      .from(movimientos)
      .where(and(eq(movimientos.asistenteId, conSaldo), eq(movimientos.tipo, 'vencimiento')));
    expect(vencimiento).toMatchObject({ puntos: -120, origen: 'sistema' });
    expect(
      await base.sistema.db.$count(
        movimientos,
        and(eq(movimientos.asistenteId, sinSaldo), eq(movimientos.tipo, 'vencimiento')),
      ),
    ).toBe(0);

    const [canje] = await base.sistema.db
      .select()
      .from(canjes)
      .where(eq(canjes.id, evento.recursos.canjes));
    expect(canje).toMatchObject({ estado: 'cancelado', canceladoPorCierre: true });
    const [premio] = await base.sistema.db.select().from(premios).where(eq(premios.id, premioId));
    expect(premio?.stockReservado).toBe(0);

    const [invitacion] = await base.sistema.db
      .select({ estado: invitaciones.estado })
      .from(invitaciones)
      .where(eq(invitaciones.id, invitacionId));
    expect(invitacion?.estado).toBe('vencida');
    const [correo] = await base.sistema.db
      .select({ estado: enviosCorreo.estado })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.refId, invitacionId));
    expect(correo?.estado).toBe('cancelado');
    const [qr] = await base.sistema.db
      .select({ estado: qrRegistro.estado })
      .from(qrRegistro)
      .where(eq(qrRegistro.id, evento.recursos.qrRegistro));
    expect(qr?.estado).toBe('invalidado');

    const [fila] = await base.sistema.db
      .select()
      .from(eventos)
      .where(eq(eventos.id, evento.eventoId));
    expect(fila).toMatchObject({ estado: 'cerrado', cierreEstado: 'sellando' });
    expect(fila?.cerradoPor).toBe(dueno.usuarioId);
    expect(
      await base.sistema.db.$count(
        outbox,
        and(eq(outbox.eventoId, evento.eventoId), eq(outbox.tipo, 'evento.cerrado')),
      ),
    ).toBe(1);
    const [entrada] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'evento.close')));
    expect(entrada?.despues).toMatchObject({
      origen: 'dueno',
      vencimientos: 1,
      puntosVencidos: 120,
    });

    // Lo que cuenta la tarjeta del Resumen.
    const estado = await pedir('GET', `/eventos/${evento.eventoId}/cierre`, coorganizador);
    expect(estado.json()).toMatchObject({ estado: 'cerrado', cierreEstado: 'sellando' });
    expect(estado.json().cerradoPor).toBeTruthy();

    // Ya cerrado: no se cierra otra vez, y lo que escribe responde EVENTO_CERRADO.
    expect(
      (
        await pedir('POST', `/eventos/${evento.eventoId}/cerrar`, dueno, { confirmacion: 'CERRAR' })
      ).json().code,
    ).toBe('TRANSICION_NO_PERMITIDA');
    expect((await pedir('POST', `/eventos/${evento.eventoId}/pausar`, dueno)).json().code).toBe(
      'EVENTO_CERRADO',
    );
  });

  it('sin escribir CERRAR no cierra; solo el dueño', async () => {
    const evento = await newEvento();
    const mal = await pedir('POST', `/eventos/${evento.eventoId}/cerrar`, dueno, {
      confirmacion: 'cerra',
    });
    expect(mal.statusCode).toBe(422);
    expect(mal.json().code).toBe('CONFIRMACION_INVALIDA');
    const coorg = await pedir('POST', `/eventos/${evento.eventoId}/cerrar`, coorganizador, {
      confirmacion: 'CERRAR',
    });
    expect(coorg.statusCode).toBe(403);
    const [fila] = await base.sistema.db
      .select({ estado: eventos.estado })
      .from(eventos)
      .where(eq(eventos.id, evento.eventoId));
    expect(fila?.estado).toBe('en_curso');
  });

  it('desde publicado se puede (con contrato); un borrador o un publicado sin contrato, no', async () => {
    const publicado = await newEvento('publicado');
    expect(
      (
        await pedir('POST', `/eventos/${publicado.eventoId}/cerrar`, dueno, {
          confirmacion: 'CERRAR',
        })
      ).statusCode,
    ).toBe(202);
    const sinContrato = await newEvento('publicado', false);
    expect(
      (
        await pedir('POST', `/eventos/${sinContrato.eventoId}/cerrar`, dueno, {
          confirmacion: 'CERRAR',
        })
      ).json().code,
    ).toBe('EVENTO_SIN_CONTRATO');
    const borrador = await newEvento('borrador', false);
    expect(
      (
        await pedir('POST', `/eventos/${borrador.eventoId}/cerrar`, dueno, {
          confirmacion: 'CERRAR',
        })
      ).json().code,
    ).toBe('TRANSICION_NO_PERMITIDA');
  });

  it('dos cierres a la vez cierran una sola vez', async () => {
    const evento = await newEvento();
    await newAsistenteConSaldo(evento, 30);
    const [a, b] = await Promise.all([
      pedir('POST', `/eventos/${evento.eventoId}/cerrar`, dueno, { confirmacion: 'CERRAR' }),
      pedir('POST', `/eventos/${evento.eventoId}/cerrar`, dueno, { confirmacion: 'CERRAR' }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    expect(
      await base.sistema.db.$count(
        movimientos,
        and(eq(movimientos.eventoId, evento.eventoId), eq(movimientos.tipo, 'vencimiento')),
      ),
    ).toBe(1);
  });

  it('programar el cierre: dentro del rango, se puede quitar y queda en la bitácora', async () => {
    const evento = await newEvento();
    const [fila] = await base.sistema.db
      .select({ finAt: eventos.finAt })
      .from(eventos)
      .where(eq(eventos.id, evento.eventoId));
    const fin = fila?.finAt ?? new Date();
    const url = `/eventos/${evento.eventoId}/cierre/programado`;
    const fuera = await pedir('PUT', url, dueno, {
      at: new Date(fin.getTime() + 25 * 3_600_000).toISOString(),
    });
    expect(fuera.json().errors?.[0]?.field).toBe('at');
    const at = new Date(Math.max(Date.now() + 3_600_000, fin.getTime())).toISOString();
    expect((await pedir('PUT', url, dueno, { at })).json()).toEqual({ programadoAt: at });
    expect(
      (await pedir('GET', `/eventos/${evento.eventoId}/cierre`, dueno)).json().programadoAt,
    ).toBe(at);
    expect((await pedir('PUT', url, dueno, { at: null })).json()).toEqual({ programadoAt: null });
    expect((await pedir('PUT', url, coorganizador, { at })).statusCode).toBe(403);
    expect(
      await base.sistema.db.$count(
        bitacora,
        and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'evento.cierre_programar')),
      ),
    ).toBe(2);
  });
});
