import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import {
  alertas,
  archivos,
  asistentes,
  enviosFoto,
  eventos,
  retoResponsables,
  retos,
  saldos,
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

/** Revisar las fotos de los retos (HU-323). Requiere Docker. */
describe('Revisión de fotos (HU-323)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let archivosDir: string;
  let duena: PersonaDePrueba;
  let coorganizadora: PersonaDePrueba;
  let responsable: PersonaDePrueba;
  let ajeno: PersonaDePrueba;
  let responsableId: string;
  let webp: Buffer;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    archivosDir = await mkdtemp(join(tmpdir(), 'pasitos-revision-'));
    api = await startApiDePrueba(base, { archivosDir });
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ retosRequierenCheckIn: false })
      .where(eq(eventos.id, evento.eventoId));
    duena = await createPersonaConSesion(base, 'Dora Duena');
    coorganizadora = await createPersonaConSesion(base, 'Carla Coorganiza');
    responsable = await createPersonaConSesion(base, 'Sara Stand');
    ajeno = await createPersonaConSesion(base, 'Otro Stand');
    await addRol(base, evento, duena, 'dueno');
    await addRol(base, evento, coorganizadora, 'coorganizador');
    responsableId = (await addRol(base, evento, responsable, 'operador_stand')) ?? '';
    await addRol(base, evento, ajeno, 'operador_stand');
    webp = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2266aa' } })
      .webp()
      .toBuffer();
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
    await rm(archivosDir, { recursive: true, force: true });
  }, 60_000);

  function pedir(
    metodo: 'GET' | 'POST',
    url: string,
    persona: PersonaDePrueba,
    cuerpo?: object,
    clave = uuidv7(),
  ) {
    return api.app.inject({
      method: metodo,
      url: `/api/v1${url}`,
      headers: {
        cookie: persona.cookie,
        'idempotency-key': clave,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      ...(cuerpo ? { payload: JSON.stringify(cuerpo) } : {}),
    });
  }

  async function newReto(
    extra: Partial<typeof retos.$inferInsert> = {},
    responsables: string[] = [],
  ) {
    const id = uuidv7();
    await base.sistema.db.insert(retos).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Foto ${id.slice(-4)}`,
      tipo: 'foto',
      puntos: 20,
      topeTotal: 100,
      instruccionFoto: 'Una foto con la mascota',
      ...extra,
    });
    for (const miembroId of responsables) {
      await base.sistema.db.insert(retoResponsables).values({
        retoId: id,
        miembroId,
        organizacionId: evento.organizacionId,
        eventoId: evento.eventoId,
      });
    }
    return id;
  }

  /** Una foto ya procesada por el trabajador, en revisión. */
  async function newFoto(retoId: string, creada = new Date()) {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Valeria ${asistenteId.slice(-5)}`,
      estado: 'presente',
    });
    const archivoId = uuidv7();
    const relativa = join('eventos', evento.organizacionId, evento.eventoId, archivoId);
    await mkdir(join(archivosDir, relativa), { recursive: true });
    await writeFile(join(archivosDir, relativa, '1200.webp'), webp);
    await base.sistema.db.insert(archivos).values({
      id: archivoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      proposito: 'foto_reto',
      nombreOriginal: 'foto',
      tamanoBytes: webp.length,
      estado: 'aprobado',
      variantes: { '1200': `${relativa.split('\\').join('/')}/1200.webp` },
    });
    const id = uuidv7();
    await base.sistema.db.insert(enviosFoto).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      retoId,
      asistenteId,
      intento: 1,
      archivoId,
      origen: 'galeria',
      estado: 'en_revision',
      autorizaUso: true,
      createdAt: creada,
    });
    return { id, asistenteId };
  }

  async function getSaldo(asistenteId: string) {
    const [fila] = await base.sistema.db
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, asistenteId));
    return fila?.puntos ?? 0;
  }

  it('un responsable ve y decide solo las fotos de sus retos, también forzando el request', async () => {
    const suyo = await newReto({}, [responsableId]);
    const otro = await newReto();
    const deSuyo = await newFoto(suyo);
    const deOtro = await newFoto(otro);

    const pendientes = (
      await pedir('GET', `/eventos/${evento.eventoId}/fotos/pendientes`, responsable)
    ).json();
    expect(pendientes).toMatchObject({ puedeRevisar: true, total: 1 });
    expect(pendientes.items.map((i: { retoId: string }) => i.retoId)).toEqual([suyo]);
    const siguiente = await pedir(
      'POST',
      `/eventos/${evento.eventoId}/fotos/siguiente`,
      responsable,
      {},
    );
    expect(siguiente.json()).toMatchObject({
      envio: { id: deSuyo.id },
      origen: 'galeria',
      autorizaUso: true,
      foto: { url1200: `/api/v1/fotos/${deSuyo.id}/imagen/1200` },
    });
    const imagen = await pedir('GET', `/fotos/${deSuyo.id}/imagen/1200`, responsable);
    expect(imagen.statusCode).toBe(200);
    expect(imagen.headers['cache-control']).toBe('private, no-store');

    expect((await pedir('GET', `/fotos/${deOtro.id}/imagen/1200`, responsable)).statusCode).toBe(
      404,
    );
    expect((await pedir('POST', `/fotos/${deOtro.id}/aprobar`, responsable)).statusCode).toBe(404);
    const sinRetos = (
      await pedir('GET', `/eventos/${evento.eventoId}/fotos/pendientes`, ajeno)
    ).json();
    expect(sinRetos).toMatchObject({ puedeRevisar: false, total: 0 });
    expect(
      (await pedir('POST', `/eventos/${evento.eventoId}/fotos/siguiente`, ajeno, {})).statusCode,
    ).toBe(204);
  });

  it('dos revisores a la vez nunca reciben la misma foto; una toma vencida se puede retomar', async () => {
    const retoId = await newReto();
    const hace = (minutos: number) => new Date(api.reloj.now().getTime() - minutos * 60_000);
    const fotos = [await newFoto(retoId, hace(10)), await newFoto(retoId, hace(9))];
    const [una, otra] = await Promise.all([
      pedir('POST', `/eventos/${evento.eventoId}/fotos/siguiente`, duena, { retoId }),
      pedir('POST', `/eventos/${evento.eventoId}/fotos/siguiente`, coorganizadora, { retoId }),
    ]);
    const tomadas = [una.json().envio.id, otra.json().envio.id];
    expect(new Set(tomadas).size).toBe(2);
    expect(tomadas.sort()).toEqual(fotos.map((f) => f.id).sort());

    const deLaDuena = una.json().envio.id as string;
    expect((await pedir('POST', `/fotos/${deLaDuena}/aprobar`, coorganizadora)).json().code).toBe(
      'FOTO_YA_TOMADA',
    );
    api.reloj.advance(3 * 60_000);
    expect((await pedir('POST', `/fotos/${deLaDuena}/aprobar`, coorganizadora)).statusCode).toBe(
      200,
    );
  });

  it('aprobar suma una vez (doble toque) y respeta el tope: al agotarse, las pendientes se rechazan', async () => {
    const retoId = await newReto({ topeTotal: 1 });
    const [primera, segunda, tercera] = [
      await newFoto(retoId),
      await newFoto(retoId),
      await newFoto(retoId),
    ];
    const clave = uuidv7();
    const aprobada = await pedir('POST', `/fotos/${primera.id}/aprobar`, duena, undefined, clave);
    expect(aprobada.json()).toMatchObject({ estado: 'aprobada', puntos: 20 });
    const otraVez = await pedir('POST', `/fotos/${primera.id}/aprobar`, duena, undefined, clave);
    expect(otraVez.json()).toEqual(aprobada.json());
    expect((await pedir('POST', `/fotos/${primera.id}/aprobar`, duena)).json().code).toBe(
      'FOTO_YA_REVISADA',
    );
    expect(await getSaldo(primera.asistenteId)).toBe(20);

    const agotada = await pedir('POST', `/fotos/${segunda.id}/aprobar`, duena);
    expect(agotada.json()).toMatchObject({ estado: 'rechazada', motivo: 'agotado' });
    const filas = await base.sistema.db
      .select({ id: enviosFoto.id, estado: enviosFoto.estado, motivo: enviosFoto.motivoRechazo })
      .from(enviosFoto)
      .where(eq(enviosFoto.retoId, retoId));
    for (const id of [segunda.id, tercera.id]) {
      expect(filas.find((f) => f.id === id)).toMatchObject({
        estado: 'rechazada',
        motivo: 'El reto ya entregó todos sus premios',
      });
    }
  });

  it('rechazar pide un motivo (con «otro», la nota); «inapropiada» oculta la foto y crea una alerta', async () => {
    const retoId = await newReto({}, [responsableId]);
    const foto = await newFoto(retoId);
    expect(
      (await pedir('POST', `/fotos/${foto.id}/rechazar`, responsable, { motivo: 'otro' }))
        .statusCode,
    ).toBe(400);
    const conNota = await newFoto(retoId);
    const rechazada = await pedir('POST', `/fotos/${conNota.id}/rechazar`, responsable, {
      motivo: 'otro',
      nota: 'Falta el logo',
    });
    expect(rechazada.json()).toMatchObject({ estado: 'rechazada', motivo: 'Falta el logo' });

    expect(
      (await pedir('POST', `/fotos/${foto.id}/rechazar`, responsable, { motivo: 'inapropiada' }))
        .statusCode,
    ).toBe(200);
    const alerta = await base.sistema.db
      .select()
      .from(alertas)
      .where(and(eq(alertas.eventoId, evento.eventoId), eq(alertas.tipo, 'foto_inapropiada')));
    expect(alerta).toHaveLength(1);
    expect((await pedir('GET', `/fotos/${foto.id}/imagen/1200`, responsable)).statusCode).toBe(404);
    expect((await pedir('GET', `/fotos/${foto.id}/imagen/1200`, duena)).statusCode).toBe(200);
  });

  it('deshacer una aprobación resta los puntos; solo D y C', async () => {
    const retoId = await newReto({}, [responsableId]);
    const foto = await newFoto(retoId);
    await pedir('POST', `/fotos/${foto.id}/aprobar`, responsable);
    expect(await getSaldo(foto.asistenteId)).toBe(20);
    expect(
      (await pedir('POST', `/fotos/${foto.id}/anular`, responsable, { motivo: 'Me equivoqué' }))
        .statusCode,
    ).toBe(403);
    const anulada = await pedir('POST', `/fotos/${foto.id}/anular`, duena, {
      motivo: 'Me equivoqué',
    });
    expect(anulada.json()).toEqual({ estado: 'anulada' });
    expect(await getSaldo(foto.asistenteId)).toBe(0);
  });
});
