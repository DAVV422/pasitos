import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { archivos, eventos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { PurgaArchivosService } from './purga.service';

/** Limpieza de la cuarentena (HU-214 §7). Requiere Docker. */
describe('purge-archivos', () => {
  let base: BaseDePrueba;
  let carpeta: string;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    carpeta = await mkdtemp(join(tmpdir(), 'pasitos-purga-'));
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
    await rm(carpeta, { recursive: true, force: true });
  });

  it('borra lo de cuarentena con más de 24 h y deja la fila con su motivo', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    const reloj = createReloj();
    const viejo = uuidv7();
    const nuevo = uuidv7();
    for (const [id, creado] of [
      [viejo, new Date(reloj.now().getTime() - 25 * 3_600_000)],
      [nuevo, reloj.now()],
    ] as const) {
      await base.sistema.db.insert(archivos).values({
        id,
        organizacionId: evento?.organizacionId ?? '',
        eventoId,
        proposito: 'importacion_csv',
        nombreOriginal: 'invitados.csv',
        tamanoBytes: 10,
        createdAt: creado,
      });
    }
    await mkdir(join(carpeta, 'cuarentena'), { recursive: true });
    await writeFile(join(carpeta, 'cuarentena', viejo), 'a,b');
    await writeFile(join(carpeta, 'cuarentena', nuevo), 'a,b');
    const huerfano = join(carpeta, 'cuarentena', 'subida-cortada');
    await writeFile(huerfano, 'x');
    const antes = new Date(reloj.now().getTime() - 30 * 3_600_000);
    await utimes(huerfano, antes, antes);

    const resultado = await new PurgaArchivosService(
      base.sistema.db,
      carpeta,
      reloj,
    ).purgeCuarentena();
    expect(resultado).toEqual({ filas: 1, archivos: 2 });
    expect(await readdir(join(carpeta, 'cuarentena'))).toEqual([nuevo]);
    const [fila] = await base.sistema.db.select().from(archivos).where(eq(archivos.id, viejo));
    expect(fila).toMatchObject({ estado: 'rechazado', motivoRechazo: 'VENCIDO_EN_CUARENTENA' });
  });
});
