import { and, eq, isNotNull } from 'drizzle-orm';
import {
  asistentes,
  bitacora,
  checkIns,
  outbox,
  saldos,
  sessions,
  tokens,
  vinculaciones,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import { createParLlaves, exportLlavePublica } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { normalizeCodigoCorto, VIGENCIA_ACCESO_MS } from './accesos-puerta';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** El QR de asistente y el enlace corto de la puerta (HU-302). Requiere Docker. */
describe('QR de asistente (HU-302)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let registrador: PersonaDePrueba;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    registrador = await createPersonaConSesion(base, 'Luis Condori');
    await addRol(base, evento, registrador, 'registrador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function newAsistente(nombre: string) {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre,
      estado: 'registrado',
    });
    return id;
  }

  function generate(asistenteId: string, cuerpo: object = {}) {
    return api.app.inject({
      method: 'POST',
      url: `/api/v1/asistentes/${asistenteId}/accesos`,
      headers: { cookie: registrador.cookie },
      payload: cuerpo,
    });
  }

  async function vincular(tipo: 'qr' | 'corto', token: string, remoto = `10.7.0.${++ip}`) {
    const par = await createParLlaves();
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: remoto,
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo,
        token,
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
  }

  function getEstado(id: string) {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1/accesos/${id}`,
      headers: { cookie: registrador.cookie },
    });
  }

  const tokenDeQr = (url: string) => url.split('/acceso/qr/')[1] ?? '';

  it('vincular con el QR deja a la persona presente, anula el enlace corto y avisa a la puerta', async () => {
    const asistenteId = await newAsistente('Valeria Quispe');
    const respuesta = await generate(asistenteId);
    expect(respuesta.statusCode).toBe(201);
    const acceso = respuesta.json();
    expect(acceso.qr).toMatch(/\/app\/acceso\/qr\/[\w-]{43}$/);
    expect(acceso.enlaceCorto).toMatch(/\/v\/[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect((await getEstado(acceso.id)).json()).toMatchObject({ estado: 'pendiente' });

    const vinculado = await vincular('qr', tokenDeQr(acceso.qr));
    expect(vinculado.statusCode).toBe(201);
    expect(vinculado.json()).toMatchObject({ asistente: { estado: 'presente' } });

    expect((await getEstado(acceso.id)).json()).toMatchObject({
      estado: 'vinculado',
      modelo: 'Chrome en Android',
    });
    const [checkIn] = await base.sistema.db
      .select()
      .from(checkIns)
      .where(eq(checkIns.asistenteId, asistenteId));
    expect(checkIn).toMatchObject({
      metodo: 'vinculacion_puerta',
      registradorId: registrador.usuarioId,
    });
    const [vinculacion] = await base.sistema.db
      .select()
      .from(vinculaciones)
      .where(eq(vinculaciones.asistenteId, asistenteId));
    expect(vinculacion).toMatchObject({
      metodo: 'qr_puerta',
      registradorId: registrador.usuarioId,
    });
    const avisos = await base.sistema.db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.tipo, 'acceso.vinculado'));
    expect(avisos.map((a) => a.payload)).toContainEqual(
      expect.objectContaining({ accesoId: acceso.id, creadoPor: registrador.usuarioId }),
    );

    // El enlace corto del mismo acceso ya no sirve.
    const corto = acceso.codigoCorto as string;
    expect((await vincular('corto', corto)).json().code).toBe('QR_ASISTENTE_VENCIDO');
  });

  it('el enlace corto, escrito a mano en minúsculas, vincula y anula el QR', async () => {
    const asistenteId = await newAsistente('Rosa Corto');
    const acceso = (await generate(asistenteId)).json();
    const escrito = (acceso.codigoCorto as string).toLowerCase().replace('-', ' ');
    const respuesta = await vincular('corto', escrito);
    expect(respuesta.statusCode).toBe(201);
    expect((await vincular('qr', tokenDeQr(acceso.qr))).json().code).toBe('QR_ASISTENTE_VENCIDO');
    const [fila] = await base.sistema.db
      .select({ metodo: vinculaciones.metodo })
      .from(vinculaciones)
      .where(eq(vinculaciones.asistenteId, asistenteId));
    expect(fila?.metodo).toBe('enlace_corto');
  });

  it('generar otro revoca el anterior; a los 2 minutos vence', async () => {
    const asistenteId = await newAsistente('Hugo Vence');
    const primero = (await generate(asistenteId)).json();
    const segundo = (await generate(asistenteId)).json();
    expect((await vincular('qr', tokenDeQr(primero.qr))).json().code).toBe('QR_ASISTENTE_VENCIDO');
    expect((await getEstado(primero.id)).json().estado).toBe('vencido');

    api.reloj.advance(VIGENCIA_ACCESO_MS + 1_000);
    expect((await getEstado(segundo.id)).json().estado).toBe('vencido');
    expect((await vincular('qr', tokenDeQr(segundo.qr))).json().code).toBe('QR_ASISTENTE_VENCIDO');
    const revocados = await base.sistema.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.refId, asistenteId), eq(tokens.grupo, primero.id)));
    expect(revocados.every((t) => t.revocadoAt !== null)).toBe(true);
  });

  it('con un celular activo, generar pide motivo (HU-304)', async () => {
    const asistenteId = await newAsistente('Eva Motivo');
    const acceso = (await generate(asistenteId)).json();
    expect((await vincular('qr', tokenDeQr(acceso.qr))).statusCode).toBe(201);
    expect((await generate(asistenteId)).json().code).toBe('MOTIVO_REQUERIDO');
    expect((await generate(asistenteId, { motivo: { tipo: 'cambio_celular' } })).statusCode).toBe(
      201,
    );
  });

  describe('revincular (HU-304)', () => {
    function getComoAsistente(url: string, cookie: string) {
      return api.app.inject({ method: 'GET', url: `/api/v1/app/${url}`, headers: { cookie } });
    }

    const cookieDe = (respuesta: Awaited<ReturnType<typeof vincular>>) =>
      `px_asistente=${respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? ''}`;

    for (const motivo of [
      { tipo: 'cambio_celular' },
      { tipo: 'borro_datos' },
      { tipo: 'se_vinculo_otra_persona' },
      { tipo: 'otro', texto: 'Se le rompió la pantalla' },
    ]) {
      it(`con el motivo ${motivo.tipo}: el anterior queda anulado y los puntos siguen`, async () => {
        const asistenteId = await newAsistente(`Revincula ${motivo.tipo}`);
        const primero = await vincular('qr', tokenDeQr((await generate(asistenteId)).json().qr));
        const viejo = cookieDe(primero);
        await base.sistema.db
          .update(saldos)
          .set({ puntos: 40 })
          .where(eq(saldos.asistenteId, asistenteId));

        const acceso = (await generate(asistenteId, { motivo })).json();
        const segundo = await vincular('qr', tokenDeQr(acceso.qr));
        expect(segundo.statusCode).toBe(201);
        expect(segundo.json()).toMatchObject({ saldo: 40, asistente: { estado: 'presente' } });

        // V18: el celular anterior ya no entra.
        expect((await getComoAsistente('estado', viejo)).json().code).toBe(
          'DISPOSITIVO_NO_VINCULADO',
        );
        const [anulada] = await base.sistema.db
          .select()
          .from(vinculaciones)
          .where(
            and(eq(vinculaciones.asistenteId, asistenteId), isNotNull(vinculaciones.anuladaAt)),
          );
        expect(anulada).toMatchObject({
          anuladaPor: registrador.usuarioId,
          motivoAnulacion: motivo.tipo === 'otro' ? 'otro: Se le rompió la pantalla' : motivo.tipo,
        });
        const revocadas = await base.sistema.db
          .select({ revocadaAt: sessions.revocadaAt })
          .from(sessions)
          .where(eq(sessions.vinculacionId, anulada?.id ?? ''));
        expect(revocadas.every((r) => r.revocadaAt !== null)).toBe(true);
        const [fila] = await base.sistema.db
          .select({ antes: bitacora.antes, despues: bitacora.despues, actor: bitacora.actorNombre })
          .from(bitacora)
          .where(
            and(eq(bitacora.objetoId, asistenteId), eq(bitacora.accion, 'asistente.revincular')),
          );
        expect(fila).toMatchObject({
          actor: 'Luis Condori',
          antes: { dispositivo: 'Chrome en Android' },
          despues: { dispositivo: 'Chrome en Android', motivo: motivo.tipo },
        });
      });
    }

    it('con otro, el texto es obligatorio; la ficha muestra el historial', async () => {
      const asistenteId = await newAsistente('Historial Ficha');
      await vincular('qr', tokenDeQr((await generate(asistenteId)).json().qr));
      expect((await generate(asistenteId, { motivo: { tipo: 'otro' } })).json().code).toBe(
        'VALIDACION',
      );
      const acceso = (await generate(asistenteId, { motivo: { tipo: 'borro_datos' } })).json();
      await vincular('qr', tokenDeQr(acceso.qr));
      const ficha = await api.app.inject({
        method: 'GET',
        url: `/api/v1/asistentes/${asistenteId}/ficha`,
        headers: { cookie: registrador.cookie },
      });
      expect(ficha.json()).toMatchObject({
        dispositivo: { modelo: 'Chrome en Android', metodo: 'qr_puerta' },
        historial: [{ metodo: 'qr_puerta', motivo: 'Borró los datos del navegador' }],
      });
    });
  });

  it('un código corto inventado, después de 5 intentos por minuto, responde 429', async () => {
    const remoto = '10.7.9.9';
    for (let i = 0; i < 5; i++) {
      expect((await vincular('corto', `ZZZZ-ZZZ${i}`, remoto)).json().code).toBe(
        'QR_ASISTENTE_VENCIDO',
      );
    }
    const bloqueado = await vincular('corto', 'ZZZZ-ZZZ9', remoto);
    expect(bloqueado.statusCode).toBe(429);
  });

  it('normaliza lo escrito a mano: sin guion, mayúsculas y O, I, L como números', () => {
    expect(normalizeCodigoCorto('k7q2-m9xd')).toBe('K7Q2M9XD');
    expect(normalizeCodigoCorto('OIL0 1')).toBe('011' + '01');
  });
});
