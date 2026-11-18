import { and, eq } from 'drizzle-orm';
import { alertas, asistentes, bitacora } from '@pasitos/db';
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

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Las reglas de alerta A3, A4 y A7 y la lista del panel (HU-318). Requiere Docker. */
describe('Alertas de trampa (HU-318)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let registrador: PersonaDePrueba;
  let dueno: PersonaDePrueba;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    registrador = await createPersonaConSesion(base, 'Luis Condori');
    dueno = await createPersonaConSesion(base, 'Diana Dueña');
    await addRol(base, evento, registrador, 'registrador');
    await addRol(base, evento, dueno, 'dueno');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function getAlertas(tipo: string) {
    return base.sistema.db
      .select()
      .from(alertas)
      .where(and(eq(alertas.eventoId, evento.eventoId), eq(alertas.tipo, tipo)));
  }

  function post(url: string, persona: PersonaDePrueba, cuerpo: object) {
    return api.app.inject({
      method: 'POST',
      url: `/api/v1${url}`,
      headers: {
        cookie: persona.cookie,
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      payload: JSON.stringify(cuerpo),
    });
  }

  async function vincularConQr(asistenteId: string, motivo?: object) {
    const acceso = (
      await post(`/asistentes/${asistenteId}/accesos`, registrador, motivo ? { motivo } : {})
    ).json();
    const par = await createParLlaves();
    ip++;
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: `10.3.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'qr',
        token: (acceso.qr as string).split('/acceso/qr/')[1],
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    expect(respuesta.statusCode).toBe(201);
    return `px_asistente=${respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? ''}`;
  }

  async function newAsistente() {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${id.slice(-6)}`,
      estado: 'registrado',
    });
    return id;
  }

  it('A3: más de 15 personas registradas por el mismo registrador en 10 minutos, una sola alerta', async () => {
    for (let i = 0; i < 15; i++) {
      expect(
        (
          await post(`/eventos/${evento.eventoId}/puerta/registros`, registrador, {
            nombre: `Fila ${i} Ñandú${i * 7}`,
            confirmarDuplicado: true,
          })
        ).statusCode,
      ).toBe(201);
    }
    expect(await getAlertas('A3')).toHaveLength(0);
    for (let i = 15; i < 18; i++) {
      await post(`/eventos/${evento.eventoId}/puerta/registros`, registrador, {
        nombre: `Fila ${i} Quinua${i * 11}`,
        confirmarDuplicado: true,
      });
    }
    const a3 = await getAlertas('A3');
    expect(a3).toHaveLength(1);
    expect(a3[0]?.datos).toMatchObject({ registradorId: registrador.usuarioId, personas: 16 });
  });

  it('A4: más de 2 revinculaciones del mismo asistente', async () => {
    const asistenteId = await newAsistente();
    await vincularConQr(asistenteId);
    await vincularConQr(asistenteId, { tipo: 'cambio_celular' });
    await vincularConQr(asistenteId, { tipo: 'borro_datos' });
    expect((await getAlertas('A4')).filter((a) => a.asistenteId === asistenteId)).toHaveLength(0);
    await vincularConQr(asistenteId, { tipo: 'cambio_celular' });
    expect((await getAlertas('A4')).filter((a) => a.asistenteId === asistenteId)).toHaveLength(1);
  });

  it('A7: el celular anulado que intenta más de 3 veces', async () => {
    const asistenteId = await newAsistente();
    const viejo = await vincularConQr(asistenteId);
    await vincularConQr(asistenteId, { tipo: 'cambio_celular' });
    for (let i = 0; i < 4; i++) {
      const r = await api.app.inject({
        method: 'GET',
        url: '/api/v1/app/estado',
        headers: { cookie: viejo },
      });
      expect(r.json().code).toBe('DISPOSITIVO_NO_VINCULADO');
    }
    const a7 = (await getAlertas('A7')).filter((a) => a.asistenteId === asistenteId);
    expect(a7).toHaveLength(1);
  });

  it('la lista del dueño: la frase y el modelo, sin IP ni huella; marcar revisada pide nota', async () => {
    const respuesta = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/alertas`,
      headers: { cookie: dueno.cookie },
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.body).not.toMatch(/huella|"ip"|10\.3\./);
    const items = respuesta.json().items as {
      id: string;
      tipo: string;
      frase: string;
      modelo: string | null;
    }[];
    const a3 = items.find((i) => i.tipo === 'A3');
    expect(a3?.frase).toBe('Luis C. registró o vinculó 16 personas en 10 minutos');
    const a7 = items.find((i) => i.tipo === 'A7');
    expect(a7?.frase).toMatch(
      /El celular anulado de Persona \w+ \(Chrome en Android\) sigue intentando entrar/,
    );

    const sinNota = await post(`/alertas/${a3?.id}/resolver`, dueno, { resolucion: 'revisada' });
    expect(sinNota.json().code).toBe('VALIDACION');
    const revisada = await post(`/alertas/${a3?.id}/resolver`, dueno, {
      resolucion: 'revisada',
      nota: 'Era la fila de la mañana, todo bien',
    });
    expect(revisada.json()).toMatchObject({ estado: 'resuelta', resolucion: 'revisada' });
    const [fila] = await base.sistema.db
      .select({ despues: bitacora.despues })
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, a3?.id ?? ''), eq(bitacora.accion, 'alerta.resolver')));
    expect(fila?.despues).toMatchObject({ resolucion: 'revisada' });
    // El registrador no ve las A1–A11.
    const delRegistrador = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/alertas`,
      headers: { cookie: registrador.cookie },
    });
    expect(
      (delRegistrador.json().items as { tipo: string }[]).every((i) => i.tipo === 'no_fui_yo'),
    ).toBe(true);
  });
});
