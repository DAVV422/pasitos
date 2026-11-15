import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { archivos, bitacora, eventos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
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
