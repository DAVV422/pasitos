import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, lt } from 'drizzle-orm';
import { archivos, type Db } from '@pasitos/db';
import type { Reloj } from '../comun/reloj';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Trabajo `purge-archivos` (HU-214 §7), cada día a las 04:00 de Bolivia: borra de `cuarentena/`
 * lo que tiene más de 24 h (un CSV que nadie importó, una subida cortada) y deja la fila con su
 * motivo. Los aprobados que nadie usa no se borran en el piloto.
 */
export class PurgaArchivosService {
  constructor(
    private readonly db: Db,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {}

  async purgeCuarentena(): Promise<{ filas: number; archivos: number }> {
    const limite = new Date(this.reloj.now().getTime() - DIA_MS);
    const vencidas = await this.db
      .update(archivos)
      .set({ estado: 'rechazado', motivoRechazo: 'VENCIDO_EN_CUARENTENA' })
      .where(and(eq(archivos.estado, 'cuarentena'), lt(archivos.createdAt, limite)))
      .returning({ id: archivos.id });
    const carpeta = join(this.archivosDir, 'cuarentena');
    let borrados = 0;
    for (const nombre of await readdir(carpeta).catch(() => [] as string[])) {
      const ruta = join(carpeta, nombre);
      const { mtime } = await stat(ruta);
      if (mtime < limite || vencidas.some((v) => v.id === nombre)) {
        await rm(ruta, { force: true });
        borrados += 1;
      }
    }
    // Exportaciones de invitados que nadie descargó (HU-210 §5): datos personales, no se guardan.
    const exportaciones = join(this.archivosDir, 'exportaciones');
    for (const nombre of await readdir(exportaciones).catch(() => [] as string[])) {
      const ruta = join(exportaciones, nombre);
      if ((await stat(ruta)).mtime < limite) {
        await rm(ruta, { force: true });
        borrados += 1;
      }
    }
    return { filas: vencidas.length, archivos: borrados };
  }
}
