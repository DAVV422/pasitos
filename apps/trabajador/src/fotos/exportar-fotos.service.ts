import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  archivos,
  asistentes,
  enviosFoto,
  eventos,
  operaciones,
  retos,
  type Db,
} from '@pasitos/db';
import { getDiasBorradoFoto } from '@pasitos/dominio';
import { buildCsv } from '@pasitos/dominio/esquemas';
import type { Reloj } from '../comun/reloj';
import { buildZip } from './zip';

const DIA_MS = 86_400_000;

/** `"Foto con la mascota"` → `"foto-con-la-mascota"`, para el nombre del archivo en el ZIP. */
function toSlug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'reto'
  );
}

/**
 * Las fotos después de la revisión (HU-324): el ZIP de *Descargar para redes* (`export-fotos`) y el
 * borrado diario (`borrar-fotos`).
 */
export class ExportarFotosService {
  private readonly logger = new Logger(ExportarFotosService.name);

  constructor(
    private readonly db: Db,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {}

  /** Toma las exportaciones de fotos en cola, de a una. */
  async processPendientes(): Promise<number> {
    let hechas = 0;
    for (;;) {
      const operacion = await this.db.transaction(async (tx) => {
        const [fila] = await tx
          .select()
          .from(operaciones)
          .where(and(eq(operaciones.estado, 'en_cola'), eq(operaciones.tipo, 'export-fotos')))
          .orderBy(asc(operaciones.createdAt))
          .limit(1)
          .for('update', { skipLocked: true });
        if (!fila) return null;
        await tx
          .update(operaciones)
          .set({ estado: 'procesando', progreso: 5, updatedAt: this.reloj.now() })
          .where(eq(operaciones.id, fila.id));
        return fila;
      });
      if (!operacion) return hechas;
      try {
        await this.export(operacion.id, operacion.eventoId);
      } catch (error) {
        this.logger.error(
          {
            operacionId: operacion.id,
            err: error instanceof Error ? error.message : String(error),
          },
          'Falló la exportación de fotos',
        );
        await this.db
          .update(operaciones)
          .set({
            estado: 'fallida',
            error: 'No pudimos armar el ZIP. Intenta de nuevo.',
            updatedAt: this.reloj.now(),
          })
          .where(eq(operaciones.id, operacion.id));
      }
      hechas += 1;
    }
  }

  /**
   * **Solo las aprobadas con autorización vigente**, en la variante original, y un `fotos.csv`
   * con el archivo, el reto, el nombre, la fecha y si la autorización era requerida.
   */
  private async export(operacionId: string, eventoId: string): Promise<void> {
    const filas = await this.db
      .select({
        id: enviosFoto.id,
        fecha: enviosFoto.createdAt,
        reto: retos.nombre,
        requerida: retos.autorizacionUso,
        nombre: asistentes.nombre,
        codigo: asistentes.codigoAsistente,
        variantes: archivos.variantes,
      })
      .from(enviosFoto)
      .innerJoin(retos, eq(retos.id, enviosFoto.retoId))
      .innerJoin(asistentes, eq(asistentes.id, enviosFoto.asistenteId))
      .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
      .where(
        and(
          eq(enviosFoto.eventoId, eventoId),
          eq(enviosFoto.estado, 'aprobada'),
          eq(enviosFoto.autorizaUso, true),
          isNull(enviosFoto.autorizaUsoRetiradaAt),
          eq(archivos.estado, 'aprobado'),
        ),
      )
      .orderBy(asc(retos.numero), asc(enviosFoto.createdAt));
    const carpeta = resolve(this.archivosDir, 'eventos');
    const entradas = [];
    const csv: (string | null)[][] = [];
    for (const fila of filas) {
      const relativa = (fila.variantes as { original?: string } | null)?.original;
      if (!relativa) continue;
      const ruta = normalize(resolve(this.archivosDir, relativa));
      if (!ruta.startsWith(carpeta + sep)) continue;
      const nombreArchivo = `${toSlug(fila.reto)}-${fila.codigo}-${fila.id.slice(-6)}.webp`;
      entradas.push({ nombre: `fotos/${nombreArchivo}`, datos: await readFile(ruta) });
      csv.push([
        nombreArchivo,
        fila.reto,
        fila.nombre,
        fila.fecha.toISOString(),
        fila.requerida === 'requerida' ? 'sí' : 'no',
      ]);
    }
    entradas.push({
      nombre: 'fotos.csv',
      datos: Buffer.from(
        buildCsv(['Archivo', 'Reto', 'Nombre', 'Fecha', 'Autorización requerida'], csv),
        'utf8',
      ),
    });
    const destino = join(this.archivosDir, 'exportaciones');
    await mkdir(destino, { recursive: true });
    const ruta = join(destino, `${operacionId}.zip`);
    await writeFile(ruta, buildZip(entradas, this.reloj.now()), { mode: 0o600 });
    await chmod(ruta, 0o600);
    await this.db
      .update(operaciones)
      .set({
        estado: 'lista',
        progreso: 100,
        resultado: { fotos: csv.length },
        updatedAt: this.reloj.now(),
      })
      .where(eq(operaciones.id, operacionId));
  }

  /**
   * `borrar-fotos` (diario): después del cierre, las inapropiadas a los 7 días, las que no tienen
   * autorización (o la retiraron) a los 30 y las autorizadas a los 90. Se borran los archivos y el
   * archivo queda `borrado`; la fila de `envios_foto` se queda, sin la imagen.
   */
  async deleteVencidas(): Promise<number> {
    const ahora = this.reloj.now().getTime();
    const candidatas = await this.db
      .select({
        archivoId: archivos.id,
        variantes: archivos.variantes,
        cerradoAt: eventos.cerradoAt,
        motivoRechazo: enviosFoto.motivoRechazo,
        autorizaUso: enviosFoto.autorizaUso,
        autorizaUsoRetiradaAt: enviosFoto.autorizaUsoRetiradaAt,
      })
      .from(enviosFoto)
      .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
      .innerJoin(eventos, eq(eventos.id, enviosFoto.eventoId))
      .where(
        and(
          isNotNull(eventos.cerradoAt),
          ne(archivos.estado, 'borrado'),
          // Al menos 7 días: antes no se borra ninguna.
          sql`${eventos.cerradoAt} < ${new Date(ahora - 7 * DIA_MS)}`,
        ),
      );
    const vencidas = candidatas.filter(
      (c) => c.cerradoAt && c.cerradoAt.getTime() + getDiasBorradoFoto(c) * DIA_MS < ahora,
    );
    const carpeta = resolve(this.archivosDir, 'eventos');
    for (const foto of vencidas) {
      for (const relativa of Object.values(
        (foto.variantes as Record<string, string> | null) ?? {},
      )) {
        const ruta = normalize(resolve(this.archivosDir, relativa));
        if (ruta.startsWith(carpeta + sep)) await rm(ruta, { force: true });
      }
    }
    if (vencidas.length > 0) {
      await this.db
        .update(archivos)
        .set({ estado: 'borrado', variantes: null })
        .where(
          inArray(
            archivos.id,
            vencidas.map((v) => v.archivoId),
          ),
        );
    }
    return vencidas.length;
  }
}
