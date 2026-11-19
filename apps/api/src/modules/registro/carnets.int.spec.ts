import { PassThrough } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import {
  alertas,
  asistentes,
  bitacora,
  checkIns,
  eventos,
  miembrosEvento,
  movimientos,
  retos,
  saldos,
  type Cifrador,
} from '@pasitos/db';
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
import { CIFRADOR } from '../auth/auth.module';

/** Verificación de carnet (HU-321). Requiere Docker. */
describe('Verificación de carnet (HU-321)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let duena: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  let operadorMesa: PersonaDePrueba;
  let stand: PersonaDePrueba;
  let cifrador: Cifrador;
  const logs: string[] = [];

  beforeAll(async () => {
    base = await startBaseDePrueba();
    const destinoLogs = new PassThrough();
    destinoLogs.on('data', (parte: Buffer) => logs.push(parte.toString('utf8')));
    api = await startApiDePrueba(base, { destinoLogs });
    cifrador = api.app.get(CIFRADOR);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ retosRequierenCheckIn: true })
      .where(eq(eventos.id, evento.eventoId));
    duena = await createPersonaConSesion(base, 'Dora Duena');
    registrador = await createPersonaConSesion(base, 'Rita Registra');
    operadorMesa = await createPersonaConSesion(base, 'Mario Mesa');
    stand = await createPersonaConSesion(base, 'Sara Stand');
    await addRol(base, evento, duena, 'dueno');
    await addRol(base, evento, registrador, 'registrador');
    await addRol(base, evento, operadorMesa, 'operador_mesa');
    const standId = await addRol(base, evento, stand, 'operador_stand');
    // La persona del stand de Pasitos verifica carnets sin ser registradora.
    await base.sistema.db
      .update(miembrosEvento)
      .set({ verificaCi: true })
      .where(eq(miembrosEvento.id, standId ?? ''));
    // Activar la verificación crea su reto, con los puntos elegidos.
    const activar = await pedir('PATCH', `/eventos/${evento.eventoId}`, duena, {
      verificacionCiActiva: true,
      puntosVerificacionCi: 30,
      pedirCi: 'opcional',
    });
    expect(activar.statusCode).toBe(200);
    expect(activar.json().reglas).toMatchObject({
      verificacionCiActiva: true,
      puntosVerificacionCi: 30,
      pedirCi: 'opcional',
    });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  function pedir(
    metodo: 'GET' | 'POST' | 'PATCH',
    url: string,
    persona: PersonaDePrueba,
    cuerpo?: object,
  ) {
    return api.app.inject({
      method: metodo,
      url: `/api/v1${url}`,
      headers: {
        cookie: persona.cookie,
        'idempotency-key': uuidv7(),
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      ...(cuerpo ? { payload: JSON.stringify(cuerpo) } : {}),
    });
  }

  async function newPersona(ci: string | null, presente = true) {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${id.slice(-5)}`,
      estado: presente ? 'presente' : 'registrado',
      origen: 'autoregistro',
      ciCifrado: ci ? cifrador.encrypt(ci) : null,
      ciUltimos: ci ? ci.replace(/\D/g, '').slice(-3) : null,
    });
    return id;
  }

  const verificar = (id: string, persona: PersonaDePrueba, cuerpo: object = {}) =>
    pedir('POST', `/asistentes/${id}/carnet/verificar`, persona, cuerpo);

  async function getSaldo(id: string) {
    const [fila] = await base.sistema.db
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, id));
    return fila?.puntos ?? 0;
  }

  it('activar crea el reto una sola vez; el panel de retos no lo edita', async () => {
    const filas = await base.sistema.db
      .select({ id: retos.id, tipo: retos.tipo, puntos: retos.puntos, tope: retos.topeTotal })
      .from(retos)
      .where(and(eq(retos.eventoId, evento.eventoId), eq(retos.tipo, 'verificacion_ci')));
    expect(filas).toEqual([
      { id: expect.any(String), tipo: 'verificacion_ci', puntos: 30, tope: 100_000 },
    ]);
    await pedir('PATCH', `/eventos/${evento.eventoId}`, duena, { verificacionCiActiva: true });
    expect(
      await base.sistema.db.$count(
        retos,
        and(eq(retos.eventoId, evento.eventoId), eq(retos.tipo, 'verificacion_ci')),
      ),
    ).toBe(1);
    const editar = await pedir('PATCH', `/retos/${filas[0]?.id ?? ''}`, duena, { puntos: 99 });
    expect(editar.statusCode).toBe(400);
  });

  it('un registrador verifica sin configurar nada y suma los puntos una vez; un operador de mesa no puede', async () => {
    const id = await newPersona('4567890 LP');
    const busqueda = await pedir(
      'POST',
      `/eventos/${evento.eventoId}/carnets/buscar`,
      registrador,
      {
        q: (
          await base.sistema.db
            .select({ codigo: asistentes.codigoAsistente })
            .from(asistentes)
            .where(eq(asistentes.id, id))
        )[0]?.codigo,
      },
    );
    expect(busqueda.json().items[0]).toMatchObject({ id, ci: '4567890 LP', verificacion: null });

    expect((await verificar(id, operadorMesa)).json().code).toBe('NO_VERIFICA_CI');
    const hecho = await verificar(id, registrador);
    expect(hecho.statusCode).toBe(200);
    expect(hecho.json()).toMatchObject({
      puntos: 30,
      saldo: 30,
      ficha: { verificacion: { por: 'Rita R.' } },
    });
    expect(await getSaldo(id)).toBe(30);
    const otraVez = await verificar(id, registrador);
    expect(otraVez.json().code).toBe('CI_YA_VERIFICADO');
    expect(await getSaldo(id)).toBe(30);
  });

  it('quien tiene «Verifica carnets» verifica aunque no sea registrador', async () => {
    const id = await newPersona('7777777 SC');
    expect((await verificar(id, stand)).statusCode).toBe(200);
  });

  it('el mismo carnet no se verifica en dos cuentas, aunque lo intenten a la vez; el segundo crea A10', async () => {
    const [uno, dos] = [await newPersona('5550001 LP'), await newPersona('5550001')];
    const respuestas = await Promise.all([verificar(uno, registrador), verificar(dos, duena)]);
    expect(respuestas.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const rechazo = respuestas.find((r) => r.statusCode === 409);
    expect(rechazo?.json()).toMatchObject({
      code: 'CI_VERIFICADO_EN_OTRA_CUENTA',
      meta: { codigo: expect.stringMatching(/^A-\d{4}$/) },
    });
    expect(JSON.stringify(rechazo?.json())).not.toContain('5550001');
    const a10 = await base.sistema.db
      .select()
      .from(alertas)
      .where(and(eq(alertas.eventoId, evento.eventoId), eq(alertas.tipo, 'A10')));
    expect(a10).toHaveLength(1);
  });

  it('corregir antes de verificar deja el anterior en la bitácora, enmascarado', async () => {
    const id = await newPersona('1234560');
    const hecho = await verificar(id, registrador, { ci: '1234567 CB' });
    expect(hecho.json().ficha.ci).toBe('1234567 CB');
    const [fila] = await base.sistema.db
      .select({ antes: bitacora.antes, despues: bitacora.despues })
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, id), eq(bitacora.accion, 'ci.verify')));
    expect(fila).toMatchObject({ antes: { carnet: '•••560' }, despues: { carnet: '•••567' } });
  });

  it('sin carnet escrito, quien verifica lo escribe desde el documento; sin check-in, lo hace en el mismo paso', async () => {
    const id = await newPersona(null, false);
    expect((await verificar(id, registrador)).json().errors[0].field).toBe('ci');
    const hecho = await verificar(id, registrador, { ci: '8888888 OR' });
    expect(hecho.statusCode).toBe(200);
    const [checkIn] = await base.sistema.db
      .select({ metodo: checkIns.metodo })
      .from(checkIns)
      .where(eq(checkIns.asistenteId, id));
    expect(checkIn?.metodo).toBe('verificacion_ci');
  });

  it('No coincide deja la nota; deshacer resta los puntos y desbloquea el carnet (solo D y C)', async () => {
    const id = await newPersona('9990001');
    expect(
      (await pedir('POST', `/asistentes/${id}/carnet/rechazar`, registrador, { nota: 'Otra foto' }))
        .statusCode,
    ).toBe(200);
    await verificar(id, registrador);
    const noPuede = await pedir('POST', `/asistentes/${id}/carnet/anular`, registrador, {
      motivo: 'Me equivoqué de persona',
    });
    expect(noPuede.statusCode).toBe(403);
    const anulado = await pedir('POST', `/asistentes/${id}/carnet/anular`, duena, {
      motivo: 'Me equivoqué de persona',
    });
    expect(anulado.statusCode).toBe(200);
    expect(anulado.json().verificacion).toBeNull();
    expect(await getSaldo(id)).toBe(0);
    expect(
      await base.sistema.db.$count(
        movimientos,
        and(eq(movimientos.asistenteId, id), eq(movimientos.tipo, 'anulacion')),
      ),
    ).toBe(1);
    // Desbloqueado: se puede verificar de nuevo, sin volver a sumar (el reto es una vez).
    const denuevo = await verificar(id, registrador);
    expect(denuevo.statusCode).toBe(200);
    expect(denuevo.json()).toMatchObject({ puntos: 0, saldo: 0 });
    const acciones = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(eq(bitacora.objetoId, id));
    expect(acciones.map((a) => a.accion)).toEqual(
      expect.arrayContaining(['ci.reject', 'ci.verify', 'ci.unverify']),
    );
  });

  it('el carnet no aparece en ningún log', () => {
    const salida = logs.join('');
    expect(salida.length).toBeGreaterThan(0);
    for (const numero of ['4567890', '5550001', '1234567', '8888888', '9990001', '7777777']) {
      expect(salida).not.toContain(numero);
    }
  });
});
