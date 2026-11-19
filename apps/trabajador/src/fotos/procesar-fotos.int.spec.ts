import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { alertas, archivos, asistentes, enviosFoto, eventos, outbox, retos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { ProcesarFotosService } from './procesar-fotos.service';

/** Una "foto de celular" con la ubicación GPS en el EXIF. */
function createFotoConGps(color: string): Promise<Buffer> {
  return sharp({ create: { width: 1800, height: 1200, channels: 3, background: color } })
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="250" fill="#000"/></svg>',
        ),
        left: 200,
        top: 300,
      },
    ])
    .withExif({
      IFD0: { Make: 'Celular de prueba', Model: 'Modelo X' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '16/1 30/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

/** El procesamiento de las fotos de los retos (HU-322 §4). Requiere Docker. */
describe('procesar-fotos', () => {
  let base: BaseDePrueba;
  let archivosDir: string;
  let eventoId: string;
  let organizacionId: string;
  let retoId: string;
  let personas: string[];

  beforeAll(async () => {
    base = await startBaseDePrueba();
    archivosDir = await mkdtemp(join(tmpdir(), 'pasitos-procesar-'));
    await mkdir(join(archivosDir, 'cuarentena'), { recursive: true });
    ({ eventoId } = await seedMovimientosPrueba(base.sistema.db, { asistentes: 3, minutos: 0 }));
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    organizacionId = evento?.organizacionId ?? '';
    retoId = uuidv7();
    await base.sistema.db.insert(retos).values({
      id: retoId,
      organizacionId,
      eventoId,
      nombre: 'Foto con la mascota',
      tipo: 'foto',
      puntos: 20,
      topeTotal: 100,
      instruccionFoto: 'Una foto con la mascota',
    });
    personas = (
      await base.sistema.db
        .select({ id: asistentes.id })
        .from(asistentes)
        .where(eq(asistentes.eventoId, eventoId))
    ).map((a) => a.id);
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
    await rm(archivosDir, { recursive: true, force: true });
  }, 60_000);

  async function recibir(asistenteId: string, datos: Buffer): Promise<string> {
    const archivoId = uuidv7();
    await writeFile(join(archivosDir, 'cuarentena', archivoId), datos);
    await base.sistema.db.insert(archivos).values({
      id: archivoId,
      organizacionId,
      eventoId,
      proposito: 'foto_reto',
      nombreOriginal: 'foto',
      mime: 'image/jpeg',
      tamanoBytes: datos.length,
    });
    const id = uuidv7();
    await base.sistema.db.insert(enviosFoto).values({
      id,
      organizacionId,
      eventoId,
      retoId,
      asistenteId,
      intento: 1,
      archivoId,
      origen: 'camara',
    });
    return id;
  }

  async function getEnvio(id: string) {
    const [fila] = await base.sistema.db
      .select({ envio: enviosFoto, archivo: archivos })
      .from(enviosFoto)
      .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
      .where(eq(enviosFoto.id, id));
    return fila;
  }

  it('la foto queda en revisión, en WebP sin EXIF ni GPS, con sus variantes y su dHash; la misma desde otra cuenta crea A11', async () => {
    const original = await createFotoConGps('#2266aa');
    const primera = await recibir(personas[0] ?? '', original);
    const servicio = new ProcesarFotosService(base.sistema.db, archivosDir, createReloj());
    expect(await servicio.processPendientes()).toBe(1);
    const fila = await getEnvio(primera);
    expect(fila?.envio.estado).toBe('en_revision');
    expect(fila?.envio.hashPerceptual).toHaveLength(8);
    expect(fila?.archivo.estado).toBe('aprobado');
    const variantes = fila?.archivo.variantes as Record<string, string>;
    expect(Object.keys(variantes).sort()).toEqual(['1200', '400', 'original']);
    const procesada = await sharp(
      await readFile(join(archivosDir, variantes['original'] ?? '')),
    ).metadata();
    expect(procesada.format).toBe('webp');
    expect(procesada.exif).toBeUndefined();
    expect(
      (await sharp(await readFile(join(archivosDir, variantes['400'] ?? ''))).metadata()).width,
    ).toBe(400);
    expect(
      await base.sistema.db.$count(
        outbox,
        and(eq(outbox.eventoId, eventoId), eq(outbox.tipo, 'foto.recibida')),
      ),
    ).toBe(1);

    // La misma foto, recomprimida, desde otra cuenta: A11.
    const copia = await sharp(original).resize(1000).jpeg({ quality: 60 }).toBuffer();
    await recibir(personas[1] ?? '', copia);
    await servicio.processPendientes();
    const a11 = await base.sistema.db
      .select({ datos: alertas.datos })
      .from(alertas)
      .where(and(eq(alertas.eventoId, eventoId), eq(alertas.tipo, 'A11')));
    expect(a11).toHaveLength(1);
    expect(a11[0]?.datos).toMatchObject({ retoId, otroAsistenteId: personas[0] });
  });

  it('una imagen dañada queda rechazada por el sistema, con un motivo legible', async () => {
    const id = await recibir(personas[2] ?? '', Buffer.from('esto no es una imagen'));
    await new ProcesarFotosService(base.sistema.db, archivosDir, createReloj()).processPendientes();
    const fila = await getEnvio(id);
    expect(fila?.envio).toMatchObject({
      estado: 'rechazada_sistema',
      motivoRechazo: 'La foto no se pudo leer. Intenta con otra',
    });
    expect(fila?.archivo.estado).toBe('rechazado');
  });
});
