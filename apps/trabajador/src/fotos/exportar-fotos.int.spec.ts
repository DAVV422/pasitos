import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { archivos, asistentes, enviosFoto, eventos, operaciones, retos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { ExportarFotosService } from './exportar-fotos.service';
import { readZip } from './zip';

const DIA_MS = 86_400_000;

/** Descargar las fotos para redes y borrarlas a tiempo (HU-324). Requiere Docker. */
describe('exportar y borrar fotos', () => {
  let base: BaseDePrueba;
  let archivosDir: string;
  let eventoId: string;
  let organizacionId: string;
  let retoId: string;
  let personas: string[];

  beforeAll(async () => {
    base = await startBaseDePrueba();
    archivosDir = await mkdtemp(join(tmpdir(), 'pasitos-exportar-'));
    ({ eventoId } = await seedMovimientosPrueba(base.sistema.db, { asistentes: 4, minutos: 0 }));
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
      autorizacionUso: 'requerida',
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

  async function newFoto(
    asistenteId: string,
    datos: Partial<typeof enviosFoto.$inferInsert>,
  ): Promise<{ archivoId: string; ruta: string }> {
    const archivoId = uuidv7();
    const relativa = `eventos/${organizacionId}/${eventoId}/${archivoId}/original.webp`;
    await mkdir(join(archivosDir, 'eventos', organizacionId, eventoId, archivoId), {
      recursive: true,
    });
    await writeFile(join(archivosDir, relativa), Buffer.from(`imagen ${archivoId}`));
    await base.sistema.db.insert(archivos).values({
      id: archivoId,
      organizacionId,
      eventoId,
      proposito: 'foto_reto',
      nombreOriginal: 'foto',
      tamanoBytes: 10,
      estado: 'aprobado',
      variantes: { original: relativa },
    });
    await base.sistema.db.insert(enviosFoto).values({
      id: uuidv7(),
      organizacionId,
      eventoId,
      retoId: datos.retoId ?? retoId,
      asistenteId,
      intento: 1,
      archivoId,
      origen: 'camara',
      estado: 'aprobada',
      autorizaUso: true,
      ...datos,
    });
    return { archivoId, ruta: join(archivosDir, relativa) };
  }

  it('el ZIP trae solo las aprobadas con autorización vigente, con su CSV', async () => {
    const [a, b, c, d] = personas;
    const autorizada = await newFoto(a ?? '', {});
    await newFoto(b ?? '', { autorizaUso: false });
    await newFoto(c ?? '', { autorizaUsoRetiradaAt: new Date() });
    await newFoto(d ?? '', { estado: 'rechazada', motivoRechazo: 'inapropiada' });
    const operacionId = uuidv7();
    await base.sistema.db.insert(operaciones).values({
      id: operacionId,
      tipo: 'export-fotos',
      organizacionId,
      eventoId,
      parametros: {},
      expiraAt: new Date(Date.now() + DIA_MS),
    });
    expect(
      await new ExportarFotosService(
        base.sistema.db,
        archivosDir,
        createReloj(),
      ).processPendientes(),
    ).toBe(1);
    const [operacion] = await base.sistema.db
      .select()
      .from(operaciones)
      .where(eq(operaciones.id, operacionId));
    expect(operacion).toMatchObject({ estado: 'lista', resultado: { fotos: 1 } });
    const entradas = readZip(
      await readFile(join(archivosDir, 'exportaciones', `${operacionId}.zip`)),
    );
    const fotos = entradas.filter((e) => e.nombre.startsWith('fotos/'));
    expect(fotos).toHaveLength(1);
    // Cada reto en su carpeta.
    expect(fotos[0]?.nombre).toMatch(/^fotos\/\d{2}-foto-con-la-mascota\/[^/]+\.webp$/);
    expect(fotos[0]?.datos.toString()).toBe(`imagen ${autorizada.archivoId}`);
    const csv = entradas.find((e) => e.nombre === 'fotos.csv')?.datos.toString() ?? '';
    expect(csv).toContain('Foto con la mascota');
    expect(csv.split('\n').filter((l) => l.trim().length > 0)).toHaveLength(2);
  });

  it('todas: una carpeta por reto; con un reto, solo las de ese reto', async () => {
    const otroReto = uuidv7();
    await base.sistema.db.insert(retos).values({
      id: otroReto,
      organizacionId,
      eventoId,
      nombre: 'Foto en la charla',
      tipo: 'foto',
      puntos: 20,
      topeTotal: 100,
      instruccionFoto: 'Una foto en la charla',
    });
    const [a, b] = personas;
    await newFoto(a ?? '', { intento: 2 });
    await newFoto(b ?? '', { retoId: otroReto });
    const exportar = async (parametros: Record<string, unknown>) => {
      const id = uuidv7();
      await base.sistema.db.insert(operaciones).values({
        id,
        tipo: 'export-fotos',
        organizacionId,
        eventoId,
        parametros,
        expiraAt: new Date(Date.now() + DIA_MS),
      });
      await new ExportarFotosService(
        base.sistema.db,
        archivosDir,
        createReloj(),
      ).processPendientes();
      const zip = readZip(await readFile(join(archivosDir, 'exportaciones', `${id}.zip`)));
      return zip.filter((e) => e.nombre.startsWith('fotos/')).map((e) => e.nombre.split('/')[1]);
    };
    // La carpeta es el número del reto (lo pone la base) y su nombre.
    const sinNumero = (carpetas: (string | undefined)[]) =>
      [...new Set(carpetas.map((c) => c?.replace(/^\d{2}-/, '')))].sort();
    expect(sinNumero(await exportar({}))).toEqual(['foto-con-la-mascota', 'foto-en-la-charla']);
    expect(sinNumero(await exportar({ retoId: otroReto }))).toEqual(['foto-en-la-charla']);
  });

  it('el borrado respeta los 7, 30 y 90 días después del cierre, y deja la fila sin la imagen', async () => {
    const reloj = createReloj();
    const ahora = reloj.now().getTime();
    const servicio = new ExportarFotosService(base.sistema.db, archivosDir, reloj);
    await base.sistema.db.delete(enviosFoto).where(eq(enviosFoto.eventoId, eventoId));
    const [a, b, c] = personas;
    const autorizada = await newFoto(a ?? '', {});
    const sinAutorizar = await newFoto(b ?? '', { autorizaUso: false });
    const inapropiada = await newFoto(c ?? '', {
      estado: 'rechazada',
      motivoRechazo: 'inapropiada',
    });
    const cerrarHace = (dias: number) =>
      base.sistema.db
        .update(eventos)
        .set({ cerradoAt: new Date(ahora - dias * DIA_MS) })
        .where(eq(eventos.id, eventoId));
    const estado = async (archivoId: string) =>
      (await base.sistema.db.select().from(archivos).where(eq(archivos.id, archivoId)))[0]?.estado;

    await cerrarHace(8);
    expect(await servicio.deleteVencidas()).toBe(1);
    expect(await estado(inapropiada.archivoId)).toBe('borrado');
    await expect(stat(inapropiada.ruta)).rejects.toThrow();

    await cerrarHace(31);
    expect(await servicio.deleteVencidas()).toBe(1);
    expect(await estado(sinAutorizar.archivoId)).toBe('borrado');
    expect(await estado(autorizada.archivoId)).toBe('aprobado');

    await cerrarHace(91);
    expect(await servicio.deleteVencidas()).toBe(1);
    expect(await estado(autorizada.archivoId)).toBe('borrado');
    // La fila de la foto se queda, para el historial y el reporte.
    expect(await base.sistema.db.$count(enviosFoto, eq(enviosFoto.eventoId, eventoId))).toBe(3);
  });
});
