import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import {
  archivos,
  asistentes,
  bitacora,
  enviosFoto,
  invitaciones,
  operaciones,
  retoResponsables,
  retos,
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

/** El seguimiento de las fotos y la descarga para redes (HU-324). Requiere Docker. */
describe('Seguimiento de fotos y descarga (HU-324)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let archivosDir: string;
  let duena: PersonaDePrueba;
  let responsable: PersonaDePrueba;
  let mesa: PersonaDePrueba;
  let consola: PersonaDePrueba;
  let retoSuyo: string;
  let retoOtro: string;
  let celular: { asistenteId: string; par: CryptoKeyPair; cookie: string };
  let fotoDelCelular: string;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    archivosDir = await mkdtemp(join(tmpdir(), 'pasitos-seguimiento-'));
    api = await startApiDePrueba(base, { archivosDir });
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    duena = await createPersonaConSesion(base, 'Dora Duena');
    responsable = await createPersonaConSesion(base, 'Sara Stand');
    mesa = await createPersonaConSesion(base, 'Mario Mesa');
    consola = await createPersonaConSesion(base, 'Ana Pasitos', undefined, {
      rolPlataforma: 'admin',
    });
    await addRol(base, evento, duena, 'dueno');
    const responsableId = (await addRol(base, evento, responsable, 'operador_stand')) ?? '';
    await addRol(base, evento, mesa, 'operador_mesa');
    retoSuyo = await newReto('Foto del stand');
    retoOtro = await newReto('Foto de la charla');
    await base.sistema.db.insert(retoResponsables).values({
      retoId: retoSuyo,
      miembroId: responsableId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
    });
    celular = await newCelular();
    fotoDelCelular = await newFoto(retoSuyo, celular.asistenteId, { estado: 'aprobada' });
    await newFoto(retoSuyo, await newAsistente(), { estado: 'aprobada', autorizaUso: false });
    await newFoto(retoOtro, await newAsistente(), { estado: 'en_revision' });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
    await rm(archivosDir, { recursive: true, force: true });
  }, 60_000);

  function pedir(metodo: 'GET' | 'POST', url: string, persona: PersonaDePrueba) {
    return api.app.inject({
      method: metodo,
      url: `/api/v1${url}`,
      headers: { cookie: persona.cookie },
    });
  }

  async function newReto(nombre: string) {
    const id = uuidv7();
    await base.sistema.db.insert(retos).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre,
      tipo: 'foto',
      puntos: 20,
      topeTotal: 100,
      instruccionFoto: 'Una foto con la mascota',
    });
    return id;
  }

  async function newAsistente() {
    const id = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${id.slice(-5)}`,
    });
    return id;
  }

  async function newCelular() {
    const asistenteId = await newAsistente();
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
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: '10.3.0.1',
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'invitacion',
        token,
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? '';
    return { asistenteId, par, cookie: `px_asistente=${cookie}` };
  }

  async function newFoto(
    retoId: string,
    asistenteId: string,
    datos: Partial<typeof enviosFoto.$inferInsert>,
  ) {
    const archivoId = uuidv7();
    const relativa = `eventos/${evento.organizacionId}/${evento.eventoId}/${archivoId}`;
    await mkdir(join(archivosDir, relativa), { recursive: true });
    await writeFile(join(archivosDir, relativa, '400.webp'), Buffer.from('miniatura'));
    await base.sistema.db.insert(archivos).values({
      id: archivoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      proposito: 'foto_reto',
      nombreOriginal: 'foto',
      tamanoBytes: 9,
      estado: 'aprobado',
      variantes: { '400': `${relativa}/400.webp` },
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
      origen: 'camara',
      autorizaUso: true,
      ...datos,
    });
    return id;
  }

  /** Lo que haría el trabajador: el ZIP listo. */
  async function prepararZip(operacionId: string) {
    await mkdir(join(archivosDir, 'exportaciones'), { recursive: true });
    await writeFile(join(archivosDir, 'exportaciones', `${operacionId}.zip`), Buffer.from('PK'));
    await base.sistema.db
      .update(operaciones)
      .set({ estado: 'lista', progreso: 100, resultado: { fotos: 1 } })
      .where(eq(operaciones.id, operacionId));
  }

  it('la lista: D y C todas, cada responsable las de sus retos, y el operador de mesa ninguna', async () => {
    const todas = (await pedir('GET', `/eventos/${evento.eventoId}/fotos`, duena)).json();
    expect(
      todas.items.filter((f: { reto: { id: string } }) => [retoSuyo, retoOtro].includes(f.reto.id)),
    ).toHaveLength(3);
    expect(todas.contadores).toMatchObject({ aprobadas: 2, conAutorizacion: 1 });
    const suyas = (await pedir('GET', `/eventos/${evento.eventoId}/fotos`, responsable)).json();
    expect(suyas.items.map((f: { reto: { id: string } }) => f.reto.id)).toEqual([
      retoSuyo,
      retoSuyo,
    ]);
    expect((await pedir('GET', `/eventos/${evento.eventoId}/fotos`, mesa)).json().items).toEqual(
      [],
    );
    const conAutorizacion = (
      await pedir('GET', `/eventos/${evento.eventoId}/fotos?autoriza=si&estado=aprobada`, duena)
    ).json();
    expect(conAutorizacion.items.map((f: { id: string }) => f.id)).toEqual([fotoDelCelular]);
    // Un responsable no descarga ni ve la ficha de fotos de una persona.
    expect(
      (await pedir('POST', `/eventos/${evento.eventoId}/fotos/descargas`, responsable)).statusCode,
    ).toBe(403);
    expect(
      (await pedir('GET', `/asistentes/${celular.asistenteId}/fotos`, duena)).json().items,
    ).toHaveLength(1);
  });

  it('descargar desde el panel: el enlace es de un solo uso y queda en la bitácora', async () => {
    const creada = await pedir('POST', `/eventos/${evento.eventoId}/fotos/descargas`, duena);
    expect(creada.statusCode).toBe(202);
    const { operacionId } = creada.json() as { operacionId: string };
    await prepararZip(operacionId);
    const estado = (await pedir('GET', `/operaciones/${operacionId}`, duena)).json();
    const descarga = await pedir('GET', estado.descarga.url.replace('/api/v1', ''), duena);
    expect(descarga.statusCode).toBe(200);
    expect(descarga.headers['content-type']).toBe('application/zip');
    expect((await pedir('GET', estado.descarga.url.replace('/api/v1', ''), duena)).statusCode).toBe(
      409,
    );
    const [fila] = await base.sistema.db
      .select({ despues: bitacora.despues })
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'foto.descargar')));
    expect(fila?.despues).toMatchObject({ fotos: 1, desde: 'panel' });
  });

  it('retirar la autorización después de la descarga: el panel avisa que no se publique', async () => {
    const ruta = `/api/v1/app/fotos/${fotoDelCelular}/retirar-autorizacion`;
    const pedido = {
      metodo: 'POST',
      ruta,
      clave: uuidv7(),
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(''),
    };
    api.reloj.advance(60_000);
    pedido.timestamp = api.reloj.now().getTime();
    const retirada = await api.app.inject({
      method: 'POST',
      url: ruta,
      headers: {
        cookie: celular.cookie,
        'idempotency-key': pedido.clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(celular.par.privateKey, pedido),
      },
    });
    expect(retirada.statusCode).toBe(200);
    const mias = (
      await api.app.inject({
        method: 'GET',
        url: '/api/v1/app/fotos',
        headers: { cookie: celular.cookie },
      })
    ).json();
    expect(mias.items[0]).toMatchObject({ id: fotoDelCelular, autorizaUso: false });
    const lista = (await pedir('GET', `/eventos/${evento.eventoId}/fotos`, duena)).json();
    expect(
      lista.items.find((f: { id: string }) => f.id === fotoDelCelular).retiradaDespuesDe,
    ).not.toBeNull();
    const fila = await base.sistema.db
      .select()
      .from(bitacora)
      .where(
        and(
          eq(bitacora.objetoId, fotoDelCelular),
          eq(bitacora.accion, 'foto.retirar_autorizacion'),
        ),
      );
    expect(fila[0]?.despues).toHaveProperty('descargadaAntesEl');
    // La imagen propia sí; la de otra persona, no.
    expect(
      (
        await api.app.inject({
          method: 'GET',
          url: `/api/v1/app/fotos/${fotoDelCelular}/imagen/400`,
          headers: { cookie: celular.cookie },
        })
      ).statusCode,
    ).toBe(200);
    const ajena = lista.items.find((f: { id: string }) => f.id !== fotoDelCelular).id;
    expect(
      (
        await api.app.inject({
          method: 'GET',
          url: `/api/v1/app/fotos/${ajena}/imagen/400`,
          headers: { cookie: celular.cookie },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('Pasitos descarga desde la consola; queda en la bitácora del evento y en la de plataforma', async () => {
    const creada = await pedir(
      'POST',
      `/plataforma/eventos/${evento.eventoId}/fotos/descargas`,
      consola,
    );
    expect(creada.statusCode).toBe(202);
    const { operacionId } = creada.json() as { operacionId: string };
    await prepararZip(operacionId);
    const estado = (
      await pedir(
        'GET',
        `/plataforma/eventos/${evento.eventoId}/operaciones/${operacionId}`,
        consola,
      )
    ).json();
    expect(
      (await pedir('GET', estado.descarga.url.replace('/api/v1', ''), consola)).statusCode,
    ).toBe(200);
    const deConsola = await base.sistema.db
      .select({ eventoId: bitacora.eventoId })
      .from(bitacora)
      .where(and(eq(bitacora.accion, 'foto.descargar'), eq(bitacora.actorId, consola.usuarioId)));
    expect(deConsola.map((f) => f.eventoId).sort()).toEqual([evento.eventoId, null].sort());
    expect(
      await base.sistema.db.$count(
        bitacora,
        and(eq(bitacora.accion, 'foto.descargar'), isNull(bitacora.eventoId)),
      ),
    ).toBe(1);
    expect(
      (await pedir('POST', `/plataforma/eventos/${evento.eventoId}/fotos/descargas`, duena))
        .statusCode,
    ).toBe(404);
  });
});
