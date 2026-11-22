import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { archivos, asistentes, bitacora, eventos, invitaciones, mesas } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import { createParLlaves, exportLlavePublica } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import {
  buildMultipart,
  createBomba,
  createEjecutable,
  createImagen,
  createJpegConGps,
  SVG_CON_SCRIPT,
  ZIP_PEGADO,
} from './pruebas/archivos-de-prueba';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Subida, validación y entrega de archivos (HU-214, V23). Requiere Docker. */
describe('Archivos (HU-214)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let carpeta: string;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let mapasPedidos = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    carpeta = await mkdtemp(join(tmpdir(), 'pasitos-archivos-'));
    const mapa = await createImagen('png', 1280, 640);
    api = await startApiDePrueba(base, {
      archivosDir: carpeta,
      traerMapa: () => {
        mapasPedidos += 1;
        return Promise.resolve(mapa);
      },
    });
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña');
    await addRol(base, evento, dueno, 'dueno');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
    await rm(carpeta, { recursive: true, force: true });
  });

  function subir(nombre: string, mime: string, datos: Buffer, proposito = 'logo_evento') {
    const { payload, contentType } = buildMultipart(nombre, mime, datos);
    return api.app.inject({
      method: 'POST',
      url: `/api/v1/eventos/${evento.eventoId}/archivos?proposito=${proposito}`,
      headers: { cookie: dueno.cookie, 'content-type': contentType },
      payload,
    });
  }

  function descargar(url: string, cookie?: string) {
    return api.app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });
  }

  async function listCuarentena(): Promise<string[]> {
    return readdir(join(carpeta, 'cuarentena')).catch(() => []);
  }

  it.each(['png', 'jpeg', 'webp'] as const)(
    'un %s válido se aprueba, reencodeado a WebP con sus variantes',
    async (formato) => {
      const respuesta = await subir(
        `logo.${formato === 'jpeg' ? 'jpg' : formato}`,
        `image/${formato}`,
        await createImagen(formato),
      );
      expect(respuesta.statusCode).toBe(201);
      const cuerpo = respuesta.json();
      expect(cuerpo).toMatchObject({ proposito: 'logo_evento', ancho: 800, alto: 600 });
      expect(Object.keys(cuerpo.variantes).sort()).toEqual(['1200', '400', 'original']);
      const chica = await descargar(cuerpo.variantes['400'], dueno.cookie);
      expect(chica.headers['content-type']).toBe('image/webp');
      expect((await sharp(chica.rawPayload).metadata()).width).toBe(400);
      const [fila] = await base.sistema.db
        .select()
        .from(archivos)
        .where(eq(archivos.id, cuerpo.id));
      expect(fila).toMatchObject({ estado: 'aprobado', mime: 'image/webp' });
      expect(await listCuarentena()).toEqual([]);
    },
  );

  it('V23: ejecutable renombrado, truncada, bomba y SVG se rechazan con su código', async () => {
    const valida = await createImagen('png');
    const casos = [
      {
        nombre: 'foto.png',
        mime: 'image/png',
        datos: createEjecutable(),
        code: 'ARCHIVO_TIPO_NO_PERMITIDO',
      },
      {
        nombre: 'foto.png',
        mime: 'image/png',
        datos: valida.subarray(0, valida.length >> 1),
        code: 'ARCHIVO_CORRUPTO',
      },
      { nombre: 'bomba.png', mime: 'image/png', datos: createBomba(), code: 'ARCHIVO_MUY_GRANDE' },
      {
        nombre: 'dibujo.svg',
        mime: 'image/svg+xml',
        datos: SVG_CON_SCRIPT,
        code: 'ARCHIVO_INVALIDO',
      },
      {
        nombre: 'dibujo.png',
        mime: 'image/png',
        datos: SVG_CON_SCRIPT,
        code: 'ARCHIVO_TIPO_NO_PERMITIDO',
      },
    ];
    for (const caso of casos) {
      const respuesta = await subir(caso.nombre, caso.mime, caso.datos);
      expect({ nombre: caso.nombre, code: respuesta.json().code }).toEqual({
        nombre: caso.nombre,
        code: caso.code,
      });
    }
    expect(await listCuarentena()).toEqual([]);
    const rechazados = await base.sistema.db
      .select({ motivo: archivos.motivoRechazo })
      .from(archivos)
      .where(and(eq(archivos.eventoId, evento.eventoId), eq(archivos.estado, 'rechazado')));
    expect(rechazados.map((r) => r.motivo)).toEqual(
      expect.arrayContaining([
        'ARCHIVO_TIPO_NO_PERMITIDO',
        'ARCHIVO_CORRUPTO',
        'ARCHIVO_MUY_GRANDE',
      ]),
    );
  });

  it('V23: un políglota (JPEG + ZIP) se acepta, pero lo servido es nuevo y no lo contiene', async () => {
    const poliglota = Buffer.concat([await createImagen('jpeg'), ZIP_PEGADO]);
    const respuesta = await subir('foto.jpg', 'image/jpeg', poliglota);
    expect(respuesta.statusCode).toBe(201);
    const servida = await descargar(respuesta.json().variantes.original, dueno.cookie);
    expect(servida.rawPayload.includes(Buffer.from('PK\x03\x04', 'latin1'))).toBe(false);
    expect(servida.rawPayload.includes(Buffer.from('programa-escondido'))).toBe(false);
  });

  it('la imagen servida no tiene EXIF (ni la ubicación GPS de la foto)', async () => {
    const conGps = await createJpegConGps();
    expect((await sharp(conGps).metadata()).exif).toBeDefined();
    const respuesta = await subir('celular.jpg', 'image/jpeg', conGps);
    const servida = await descargar(respuesta.json().variantes.original, dueno.cookie);
    const metadatos = await sharp(servida.rawPayload).metadata();
    expect(metadatos.exif).toBeUndefined();
    expect(servida.rawPayload.includes(Buffer.from('Celular de prueba'))).toBe(false);
  });

  it('más de 2 MB para un logo: 413 sin guardar nada', async () => {
    const grande = Buffer.concat([await createImagen('png'), Buffer.alloc(3 * 1024 * 1024)]);
    const respuesta = await subir('logo.png', 'image/png', grande);
    expect(respuesta.statusCode).toBe(413);
    expect(respuesta.json().code).toBe('ARCHIVO_MUY_GRANDE');
    expect(await listCuarentena()).toEqual([]);
  });

  it('evento privado: sin sesión, 404; público: sin sesión y con caché larga', async () => {
    const subida = (
      await subir('portada.png', 'image/png', await createImagen('png'), 'portada')
    ).json();
    const url = subida.variantes.original;
    expect((await descargar(url)).statusCode).toBe(404);
    const conSesion = await descargar(url, dueno.cookie);
    expect(conSesion.statusCode).toBe(200);
    expect(conSesion.headers['cache-control']).toBe('private, max-age=300');
    expect(conSesion.headers['x-content-type-options']).toBe('nosniff');
    const ajena = await createPersonaConSesion(base, 'Ajena');
    expect((await descargar(url, ajena.cookie)).statusCode).toBe(404);

    await base.sistema.db
      .update(eventos)
      .set({ visibilidad: 'publico' })
      .where(eq(eventos.id, evento.eventoId));
    const publica = await descargar(url);
    expect(publica.statusCode).toBe(200);
    expect(publica.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    await base.sistema.db
      .update(eventos)
      .set({ visibilidad: 'privado' })
      .where(eq(eventos.id, evento.eventoId));
  });

  /** Un asistente con su celular vinculado a ese evento: devuelve la cookie de su sesión. */
  async function vincularAsistente(de: EventoDePrueba): Promise<string> {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: de.organizacionId,
      eventoId: de.eventoId,
      nombre: `Valeria ${asistenteId.slice(-5)}`,
      estado: 'presente',
    });
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(invitaciones).values({
      id: uuidv7(),
      organizacionId: de.organizacionId,
      eventoId: de.eventoId,
      asistenteId,
      tokenHash: hash,
      tokenCifrado: Buffer.from('cifrado-de-prueba'),
      estado: 'enviada',
    });
    const par = await createParLlaves();
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
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
    return `px_asistente=${respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? ''}`;
  }

  it('evento privado: el celular vinculado y la mesa del evento ven sus imágenes; los de otro evento, no', async () => {
    const subida = (
      await subir('premio.png', 'image/png', await createImagen('png'), 'imagen_premio')
    ).json();
    const url = subida.variantes['400'] as string;
    expect((await descargar(url)).statusCode).toBe(404);

    const deEste = await vincularAsistente(evento);
    const respuesta = await descargar(url, deEste);
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('private, max-age=300');

    const otro = await createEventoDePrueba(base, { estado: 'en_curso' });
    expect((await descargar(url, await vincularAsistente(otro))).statusCode).toBe(404);

    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(mesas).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Mesa de premios',
      estado: 'activa',
      sessionTokenHash: hash,
    });
    expect((await descargar(url, `px_terminal=${token}`)).statusCode).toBe(200);
    expect((await descargar(url, 'px_terminal=inventado')).statusCode).toBe(404);
  });

  it('CSV: en Latin-1 se rechaza con cómo guardarlo; en UTF-8 queda en cuarentena y no se sirve', async () => {
    const latin1 = Buffer.from('nombre;correo\nJos\xe9 P\xe9rez;jose@example.com\n', 'latin1');
    const mala = await subir('invitados.csv', 'text/csv', latin1, 'importacion_csv');
    expect(mala.json()).toMatchObject({ code: 'ARCHIVO_TIPO_NO_PERMITIDO' });
    expect(mala.json().detail).toContain('CSV UTF-8');

    const buena = await subir(
      'invitados.csv',
      'text/csv',
      Buffer.from('nombre,correo\nJosé Pérez,jose@example.com\n'),
      'importacion_csv',
    );
    expect(buena.statusCode).toBe(201);
    expect(await listCuarentena()).toEqual([buena.json().id]);
    expect(
      (await descargar(`/api/v1/archivos/${buena.json().id}/original`, dueno.cookie)).statusCode,
    ).toBe(404);
  });

  it('cada subida deja su bitácora, sin el contenido', async () => {
    const filas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'archivo.upload')));
    expect(filas.length).toBeGreaterThan(3);
    expect(filas[0]?.objetoTipo).toBe('archivo');
  });

  it('la ubicación con punto pide el mapa una vez y lo guarda; sin punto, sin mapa', async () => {
    const pedir = (body: object) =>
      api.app.inject({
        method: 'PUT',
        url: `/api/v1/eventos/${evento.eventoId}/ubicacion`,
        headers: { cookie: dueno.cookie },
        payload: body,
      });
    const conPunto = await pedir({
      nombre: 'Centro de Ejemplo',
      direccion: 'Av. Ejemplo 123',
      lat: -16.5,
      lng: -68.15,
    });
    expect(conPunto.statusCode).toBe(200);
    expect(conPunto.json().mapaEstaticoArchivoId).toBeTruthy();
    expect(mapasPedidos).toBe(1);
    // El mismo punto no vuelve a pedir el mapa.
    await pedir({
      nombre: 'Centro de Ejemplo (Salón 2)',
      direccion: 'Av. Ejemplo 123',
      lat: -16.5,
      lng: -68.15,
    });
    expect(mapasPedidos).toBe(1);
    const sinPunto = await pedir({ nombre: 'Por definir', direccion: '' });
    expect(sinPunto.json()).toMatchObject({ lat: null, lng: null, mapaEstaticoArchivoId: null });
    const malo = await pedir({ nombre: 'X lugar', direccion: '', lat: -16.5 });
    expect(malo.json().code).toBe('VALIDACION');
  });
});
