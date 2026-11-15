import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { asistentes, operaciones, type Db } from '@pasitos/db';
import {
  buildCsv,
  esquemaEmail,
  hasColumnaNombre,
  mapColumnas,
  MAX_FILAS_CSV,
  normalizeTexto,
  parseCsv,
  readFilas,
  SIMILITUD_DUPLICADO,
  type FilaCsv,
} from '@pasitos/dominio/esquemas';
import type { Reloj } from '../comun/reloj';

type Operacion = typeof operaciones.$inferSelect;

interface Motivo {
  readonly fila: number;
  readonly nombre: string;
  readonly motivo: string;
}

interface PosibleDuplicada extends FilaCsv {
  readonly parecidoA: { readonly codigo: string; readonly nombre: string };
}

/** Las primeras válidas que ve la vista previa (las demás quedan para confirmar). */
const VALIDAS_EN_VISTA = 50;

class ErrorImportacion extends Error {}

/**
 * Trabajo `process-operaciones` (HU-210 §4 y §5): valida el CSV de una importación y arma la
 * vista previa, o genera el CSV de una exportación. Corre con el rol de sistema, siempre filtrando
 * por el evento de la operación.
 */
export class OperacionesTrabajoService {
  private readonly logger = new Logger(OperacionesTrabajoService.name);

  constructor(
    private readonly db: Db,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {}

  /** Toma las operaciones en cola de a una (`SKIP LOCKED`: dos trabajadores no toman la misma). */
  async processPendientes(limite = 5): Promise<number> {
    let hechas = 0;
    for (let i = 0; i < limite; i++) {
      const operacion = await this.db.transaction(async (tx) => {
        const [fila] = await tx
          .select()
          .from(operaciones)
          .where(
            and(
              eq(operaciones.estado, 'en_cola'),
              sql`${operaciones.tipo} in ('import-asistentes', 'export-asistentes')`,
            ),
          )
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
      if (!operacion) break;
      await this.process(operacion);
      hechas += 1;
    }
    return hechas;
  }

  private async process(operacion: Operacion): Promise<void> {
    try {
      if (operacion.tipo === 'import-asistentes') {
        await this.processImportacion(operacion);
      } else {
        await this.processExportacion(operacion);
      }
    } catch (error) {
      const esperado = error instanceof ErrorImportacion;
      if (!esperado) {
        this.logger.error(
          {
            operacionId: operacion.id,
            err: error instanceof Error ? error.message : String(error),
          },
          'Falló una operación',
        );
      }
      await this.db
        .update(operaciones)
        .set({
          estado: 'fallida',
          error: esperado ? error.message : 'No pudimos procesar el archivo. Intenta de nuevo.',
          resultado: esperado ? { code: 'IMPORTACION_INVALIDA' } : null,
          updatedAt: this.reloj.now(),
        })
        .where(eq(operaciones.id, operacion.id));
    }
  }

  // ── Importar ───────────────────────────────────────────────────────────────

  private async processImportacion(operacion: Operacion): Promise<void> {
    const { archivoId } = operacion.parametros as { archivoId: string };
    const texto = (await readFile(join(this.archivosDir, 'cuarentena', archivoId))).toString(
      'utf-8',
    );
    const [encabezados = [], ...datos] = parseCsv(texto);
    const columnas = mapColumnas(encabezados);
    if (!hasColumnaNombre(columnas)) {
      throw new ErrorImportacion('No encontramos la columna del nombre.');
    }
    if (datos.length > MAX_FILAS_CSV) {
      throw new ErrorImportacion(`El archivo tiene más de ${MAX_FILAS_CSV} filas.`);
    }
    const filas = readFilas(datos, columnas);
    await this.setProgreso(operacion.id, 30);

    const invalidas: Motivo[] = [];
    const duplicadas: Motivo[] = [];
    const candidatas: FilaCsv[] = [];
    const vistos = new Map<string, number>();
    for (const fila of filas) {
      const motivo = getMotivoInvalida(fila);
      if (motivo) {
        invalidas.push({
          fila: fila.fila,
          nombre: fila.nombre,
          motivo: `Fila ${fila.fila}: ${motivo}`,
        });
        continue;
      }
      const claves = [
        fila.email ? `e:${fila.email}` : null,
        fila.codigoExterno ? `c:${fila.codigoExterno}` : null,
      ].filter((c): c is string => c !== null);
      const igual = claves.map((c) => vistos.get(c)).find((n) => n !== undefined);
      if (igual !== undefined) {
        duplicadas.push({
          fila: fila.fila,
          nombre: fila.nombre,
          motivo: `Igual a la fila ${igual}`,
        });
        continue;
      }
      for (const c of claves) vistos.set(c, fila.fila);
      candidatas.push(fila);
    }

    // Contra la lista del evento: correo o código ya cargados.
    const existentes = await this.db
      .select({
        codigo: asistentes.codigoAsistente,
        email: asistentes.email,
        codigoExterno: asistentes.codigoExterno,
      })
      .from(asistentes)
      .where(eq(asistentes.eventoId, operacion.eventoId));
    const porEmail = new Map(
      existentes.flatMap((e) => (e.email ? [[e.email.toLowerCase(), e.codigo]] : [])),
    );
    const porCodigo = new Map(
      existentes.flatMap((e) => (e.codigoExterno ? [[e.codigoExterno, e.codigo]] : [])),
    );
    const sinRepetir = candidatas.filter((f) => {
      const codigo =
        (f.email && porEmail.get(f.email)) ?? (f.codigoExterno && porCodigo.get(f.codigoExterno));
      if (codigo) {
        duplicadas.push({
          fila: f.fila,
          nombre: f.nombre,
          motivo: `Ya está en la lista como ${codigo}`,
        });
        return false;
      }
      return true;
    });
    await this.setProgreso(operacion.id, 60);

    // Nombre muy parecido a alguien de la lista, sin un correo que los distinga.
    const parecidos = await this.findParecidos(operacion.eventoId, sinRepetir);
    const posiblesDuplicadas: PosibleDuplicada[] = [];
    const validas: FilaCsv[] = [];
    for (const fila of sinRepetir) {
      const parecido = parecidos
        .get(fila.fila)
        ?.find((p) => !(fila.email && p.email && p.email.toLowerCase() !== fila.email));
      if (parecido) {
        posiblesDuplicadas.push({
          ...fila,
          parecidoA: { codigo: parecido.codigo, nombre: parecido.nombre },
        });
      } else {
        validas.push(fila);
      }
    }

    await this.db
      .update(operaciones)
      .set({
        estado: 'lista',
        progreso: 100,
        resultado: {
          columnas: { reconocidas: columnas.reconocidas, ignoradas: columnas.ignoradas },
          totales: {
            filas: filas.length,
            validas: validas.length,
            invalidas: invalidas.length,
            duplicadas: duplicadas.length,
            posiblesDuplicadas: posiblesDuplicadas.length,
          },
          validas: validas.slice(0, VALIDAS_EN_VISTA),
          invalidas,
          duplicadas: duplicadas.sort((a, b) => a.fila - b.fila),
          posiblesDuplicadas,
        },
        datos: { validas, posiblesDuplicadas },
        updatedAt: this.reloj.now(),
      })
      .where(eq(operaciones.id, operacion.id));
  }

  private async findParecidos(eventoId: string, filas: readonly FilaCsv[]) {
    const porFila = new Map<number, { codigo: string; nombre: string; email: string | null }[]>();
    if (filas.length === 0) return porFila;
    const resultado = await this.db.transaction(async (tx) => {
      // Con el umbral en 0,6, el operador `%` usa el índice trigram.
      await tx.execute(
        sql`select set_config('pg_trgm.similarity_threshold', ${String(SIMILITUD_DUPLICADO)}, true)`,
      );
      return tx.execute<{ fila: number; codigo: string; nombre: string; email: string | null }>(sql`
        select f.fila, a.codigo_asistente as codigo, a.nombre, a.email::text as email
          from jsonb_to_recordset(${JSON.stringify(filas.map((f) => ({ fila: f.fila, nombre: f.nombre })))}::jsonb) as f(fila int, nombre text)
          join asistentes a
            on a.evento_id = ${eventoId}
           and a.estado <> 'cancelado'
           and pasitos_normalizar(a.nombre) % pasitos_normalizar(f.nombre)
         order by f.fila, similarity(pasitos_normalizar(a.nombre), pasitos_normalizar(f.nombre)) desc`);
    });
    for (const p of resultado.rows) {
      porFila.set(p.fila, [...(porFila.get(p.fila) ?? []), p]);
    }
    return porFila;
  }

  // ── Exportar ───────────────────────────────────────────────────────────────

  private async processExportacion(operacion: Operacion): Promise<void> {
    const { estado } = operacion.parametros as { estado?: string };
    const filas = await this.db
      .select({
        codigo: asistentes.codigoAsistente,
        nombre: asistentes.nombre,
        email: asistentes.email,
        codigoExterno: asistentes.codigoExterno,
        estado: asistentes.estado,
        origen: asistentes.origen,
      })
      .from(asistentes)
      .where(
        and(
          eq(asistentes.eventoId, operacion.eventoId),
          estado ? eq(asistentes.estado, estado) : undefined,
        ),
      )
      .orderBy(sql`length(${asistentes.codigoAsistente})`, asc(asistentes.codigoAsistente));
    // "Presente desde" llega con el check-in (fase 3).
    const csv = buildCsv(
      ['Código', 'Nombre', 'Correo', 'Código externo', 'Estado', 'Origen', 'Presente desde'],
      filas.map((f) => [f.codigo, f.nombre, f.email, f.codigoExterno, f.estado, f.origen, null]),
    );
    const carpeta = join(this.archivosDir, 'exportaciones');
    await mkdir(carpeta, { recursive: true });
    const ruta = join(carpeta, `${operacion.id}.csv`);
    await writeFile(ruta, csv, { encoding: 'utf-8', mode: 0o600 });
    await chmod(ruta, 0o600);
    await this.db
      .update(operaciones)
      .set({
        estado: 'lista',
        progreso: 100,
        resultado: { filas: filas.length },
        updatedAt: this.reloj.now(),
      })
      .where(eq(operaciones.id, operacion.id));
  }

  private async setProgreso(id: string, progreso: number): Promise<void> {
    await this.db
      .update(operaciones)
      .set({ progreso, updatedAt: this.reloj.now() })
      .where(eq(operaciones.id, id));
  }
}

function getMotivoInvalida(fila: FilaCsv): string | null {
  if (normalizeTexto(fila.nombre).length < 2) return 'falta el nombre';
  if (fila.nombre.length > 120) return 'el nombre tiene más de 120 caracteres';
  if (fila.email && !esquemaEmail.safeParse(fila.email).success) return 'el correo no es válido';
  if (fila.codigoExterno && fila.codigoExterno.length > 60) {
    return 'el código tiene más de 60 caracteres';
  }
  return null;
}
