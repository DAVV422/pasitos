import { and, eq } from 'drizzle-orm';
import { alertas, asistentes, bitacora, outbox } from '@pasitos/db';
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

/** Los avisos No fui yo en la puerta (HU-305). Requiere Docker. */
describe('Avisos No fui yo (HU-305)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let luis: PersonaDePrueba;
  let rita: PersonaDePrueba;
  let dueno: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    luis = await createPersonaConSesion(base, 'Luis Condori');
    rita = await createPersonaConSesion(base, 'Rita Mamani');
    dueno = await createPersonaConSesion(base, 'Diana Dueña');
    await addRol(base, evento, luis, 'registrador');
    await addRol(base, evento, rita, 'registrador');
    await addRol(base, evento, dueno, 'dueno');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function newAviso(tipo = 'no_fui_yo') {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Valeria ${tipo} ${asistenteId.slice(-4)}`,
      estado: 'presente',
    });
    const id = uuidv7();
    await base.sistema.db.insert(alertas).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      tipo,
      asistenteId,
      datos: { desde: 'anulado', sobre: 'dispositivo' },
      clave: `prueba:${id}`,
    });
    return { id, asistenteId };
  }

  function post(url: string, persona: PersonaDePrueba, cuerpo: object = {}) {
    return api.app.inject({
      method: 'POST',
      url: `/api/v1${url}`,
      headers: { cookie: persona.cookie },
      payload: cuerpo,
    });
  }

  function list(persona: PersonaDePrueba, query = '') {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/alertas${query}`,
      headers: { cookie: persona.cookie },
    });
  }

  it('el registrador ve solo los No fui yo, con el asistente y qué no reconoce', async () => {
    const aviso = await newAviso();
    const a1 = await newAviso('A1');
    const items = (await list(luis)).json().items as { id: string; tipo: string }[];
    expect(items.map((i) => i.id)).toContain(aviso.id);
    expect(items.map((i) => i.id)).not.toContain(a1.id);
    expect(items.find((i) => i.id === aviso.id)).toMatchObject({
      queNoReconoce: 'No reconoce un dispositivo',
      desde: 'anulado',
      asistente: { id: aviso.asistenteId },
    });
    // Aunque lo pida: el A1 no existe para él.
    expect((await post(`/alertas/${a1.id}/atender`, luis)).statusCode).toBe(404);
    // El dueño ve todo.
    const delDueno = (await list(dueno, '?tipo=A1')).json().items as { id: string }[];
    expect(delDueno.map((i) => i.id)).toContain(a1.id);
  });

  it('atender en paralelo: uno gana y el otro ve quién lo tomó', async () => {
    const aviso = await newAviso();
    const [a, b] = await Promise.all([
      post(`/alertas/${aviso.id}/atender`, luis),
      post(`/alertas/${aviso.id}/atender`, rita),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const perdio = a.statusCode === 409 ? a : b;
    expect(perdio.json().code).toBe('ALERTA_YA_ATENDIDA');
    expect(perdio.json().detail).toMatch(/^Lo está atendiendo (Luis C|Rita M)\.\.?$/);
    const [fila] = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, aviso.id), eq(bitacora.accion, 'alerta.atender')));
    expect(fila).toBeDefined();
    const avisos = await base.sistema.db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.tipo, 'alerta.actualizada'));
    expect(avisos.map((x) => (x.payload as { alertaId: string }).alertaId)).toContain(aviso.id);
  });

  it('descartar pide nota; derivar es del registrador y lo pasa a los coorganizadores', async () => {
    const aviso = await newAviso();
    await post(`/alertas/${aviso.id}/atender`, luis);
    expect(
      (await post(`/alertas/${aviso.id}/resolver`, luis, { resolucion: 'descartar' })).json().code,
    ).toBe('VALIDACION');
    const descartado = await post(`/alertas/${aviso.id}/resolver`, luis, {
      resolucion: 'descartar',
      nota: 'Reconoce el cambio: era su tablet',
    });
    expect(descartado.json()).toMatchObject({ estado: 'descartada' });

    const otro = await newAviso();
    await post(`/alertas/${otro.id}/atender`, dueno);
    expect(
      (await post(`/alertas/${otro.id}/resolver`, dueno, { resolucion: 'derivar' })).json().code,
    ).toBe('SIN_PERMISO');
    const tercero = await newAviso();
    await post(`/alertas/${tercero.id}/atender`, rita);
    const derivado = await post(`/alertas/${tercero.id}/resolver`, rita, {
      resolucion: 'derivar',
      nota: 'No reconoce un canje',
    });
    expect(derivado.json()).toMatchObject({ estado: 'derivada' });
    // Los derivados van arriba en la lista del dueño.
    const items = (await list(dueno, '?tipo=no_fui_yo')).json().items as { id: string }[];
    expect(items[0]?.id).toBe(tercero.id);
  });

  it('revincular cierra el aviso al vincular el celular nuevo', async () => {
    const aviso = await newAviso();
    await post(`/alertas/${aviso.id}/atender`, luis);
    expect(
      (await post(`/alertas/${aviso.id}/resolver`, luis, { resolucion: 'revincular' })).json(),
    ).toMatchObject({ estado: 'atendiendo', resolucion: 'revincular' });
    const acceso = (
      await post(`/asistentes/${aviso.asistenteId}/accesos`, luis, {
        motivo: { tipo: 'se_vinculo_otra_persona', alertaId: aviso.id },
      })
    ).json();
    const par = await createParLlaves();
    const vinculado = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: '10.6.0.1',
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'qr',
        token: (acceso.qr as string).split('/acceso/qr/')[1],
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    expect(vinculado.statusCode).toBe(201);
    const [fila] = await base.sistema.db
      .select({ estado: alertas.estado, resolucion: alertas.resolucion })
      .from(alertas)
      .where(eq(alertas.id, aviso.id));
    expect(fila).toEqual({ estado: 'resuelta', resolucion: 'revincular' });
  });
});
