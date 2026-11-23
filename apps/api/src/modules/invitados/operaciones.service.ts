import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import {
  asistentes,
  eventos,
  operaciones,
  retos,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import {
  VIGENCIA_DESCARGA_MS,
  VIGENCIA_OPERACION_MS,
  type FilaCsv,
} from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { createTokenAleatorio, hashToken } from '../auth/auth.repository';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';

type Operacion = typeof operaciones.$inferSelect;

/** Lo que el trabajador deja para confirmar la importación (no lo ve el panel). */
export interface DatosImportacion {
  readonly validas: readonly FilaCsv[];
  readonly posiblesDuplicadas: readonly FilaCsv[];
}

export interface Confirmacion {
  readonly importadas: number;
  readonly omitidas: number;
  readonly duplicadasNuevas: readonly { fila: number; motivo: string }[];
}

const LOTE = 500;

/** Las operaciones que terminan en un archivo para descargar. */
const EXPORTACIONES = new Set(['export-asistentes', 'export-fotos']);

/**
 * Importar y exportar la lista de invitados (HU-210 §4 y §5). Crear la operación y confirmarla
 * pasan aquí; validar el CSV y armar la exportación los hace el trabajador (`process-operaciones`).
 */
export class OperacionesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly archivosDir: string,
  ) {}

  createImportacion(contexto: ContextoEvento, archivoId: string) {
    return this.create(contexto, 'import-asistentes', { archivoId });
  }

  createExportacion(contexto: ContextoEvento, estado: string | undefined) {
    return this.create(contexto, 'export-asistentes', estado ? { estado } : {});
  }

  /**
   * HU-324: el ZIP de las fotos autorizadas (lo arma el trabajador), cada reto en su carpeta. Con
   * `retoId`, solo las de ese reto (un reto de foto de este evento).
   */
  async createExportacionFotos(
    evento: { readonly organizacionId: string; readonly eventoId: string },
    usuarioId: string,
    desde: 'panel' | 'consola',
    retoId?: string,
  ) {
    if (retoId) {
      const [reto] = await withOrganizacion(this.db, evento.organizacionId, (tx) =>
        tx
          .select({ id: retos.id })
          .from(retos)
          .where(
            and(eq(retos.id, retoId), eq(retos.eventoId, evento.eventoId), eq(retos.tipo, 'foto')),
          ),
      );
      if (!reto) throw new AppError('NO_ENCONTRADO');
    }
    return this.create(
      { ...evento, usuarioId },
      'export-fotos',
      retoId ? { desde, retoId } : { desde },
    );
  }

  /**
   * El estado para el panel (o la consola, HU-324). Una exportación lista trae un enlace nuevo
   * (10 min, un solo uso).
   */
  async get(
    contexto: Pick<ContextoEvento, 'organizacionId' | 'eventoId'>,
    id: string,
    base = '/api/v1',
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const operacion = await this.getOperacion(tx, contexto, id);
      let descarga: { url: string; expiraAt: string } | null = null;
      if (
        EXPORTACIONES.has(operacion.tipo) &&
        operacion.estado === 'lista' &&
        !operacion.descargadaAt
      ) {
        const { token, hash } = createTokenAleatorio();
        const expiraAt = new Date(this.reloj.now().getTime() + VIGENCIA_DESCARGA_MS);
        await tx
          .update(operaciones)
          .set({ descargaTokenHash: hash, descargaExpiraAt: expiraAt })
          .where(eq(operaciones.id, id));
        descarga = {
          url: `${base}/operaciones/${id}/descarga?token=${token}`,
          expiraAt: expiraAt.toISOString(),
        };
      }
      return {
        id: operacion.id,
        tipo: operacion.tipo,
        estado: operacion.estado,
        progreso: operacion.progreso,
        resultado: operacion.resultado,
        error: operacion.error,
        expiraAt: operacion.expiraAt.toISOString(),
        descarga,
      };
    });
  }

  /**
   * Paso 2 de la importación, en **una** transacción. Vuelve a mirar los correos y códigos contra
   * la lista (alguien pudo cargar a mano entre los dos pasos). Confirmar otra vez responde lo mismo.
   */
  async confirm(
    contexto: ContextoEvento,
    id: string,
    incluir: readonly number[],
  ): Promise<Confirmacion> {
    const resultado = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const operacion = await this.getOperacion(tx, contexto, id, true);
      if (operacion.tipo !== 'import-asistentes') {
        throw new AppError('NO_ENCONTRADO');
      }
      const previo = (operacion.resultado as { confirmacion?: Confirmacion } | null)?.confirmacion;
      if (operacion.estado === 'confirmada' && previo) {
        return { confirmacion: previo, archivoId: null };
      }
      if (operacion.estado !== 'lista' || operacion.expiraAt <= this.reloj.now()) {
        throw new AppError('OPERACION_NO_LISTA');
      }
      // Bloquea el evento: las altas a mano esperan a que termine (y el control de repetidos vale).
      await tx
        .select({ id: eventos.id })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId))
        .for('update');
      const datos = operacion.datos as DatosImportacion;
      const elegidas = new Set(incluir);
      const candidatas = [
        ...datos.validas,
        ...datos.posiblesDuplicadas.filter((f) => elegidas.has(f.fila)),
      ].sort((a, b) => a.fila - b.fila);

      const ya = await this.findRepetidos(tx, contexto, candidatas);
      const duplicadasNuevas: { fila: number; motivo: string }[] = [];
      const aInsertar = candidatas.filter((f) => {
        const codigo =
          (f.email && ya.porEmail.get(f.email.toLowerCase())) ??
          (f.codigoExterno && ya.porCodigo.get(f.codigoExterno));
        if (codigo) {
          duplicadasNuevas.push({ fila: f.fila, motivo: `Ya está en la lista como ${codigo}` });
          return false;
        }
        return true;
      });
      for (let i = 0; i < aInsertar.length; i += LOTE) {
        await tx.insert(asistentes).values(
          aInsertar.slice(i, i + LOTE).map((f) => ({
            id: uuidv7(),
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            nombre: f.nombre,
            email: f.email,
            codigoExterno: f.codigoExterno,
            celular: f.celular ?? null,
            origen: 'csv',
            estado: 'invitado',
            emailEstado: f.email ? 'pendiente' : 'sin_correo',
            createdBy: contexto.usuarioId,
          })),
        );
      }
      const totales = (operacion.resultado as { totales?: { filas?: number } } | null)?.totales;
      const confirmacion: Confirmacion = {
        importadas: aInsertar.length,
        omitidas: (totales?.filas ?? candidatas.length) - aInsertar.length,
        duplicadasNuevas,
      };
      await tx
        .update(operaciones)
        .set({
          estado: 'confirmada',
          datos: null,
          resultado: sql`coalesce(${operaciones.resultado}, '{}'::jsonb) || ${JSON.stringify({ confirmacion })}::jsonb`,
          updatedAt: this.reloj.now(),
        })
        .where(eq(operaciones.id, id));
      // Sin la lista de personas: solo los totales.
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'importacion.confirm',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'operacion', id, nombre: 'Importación de invitados' },
        despues: {
          importadas: confirmacion.importadas,
          omitidas: confirmacion.omitidas,
        },
      });
      return {
        confirmacion,
        archivoId: (operacion.parametros as { archivoId?: string }).archivoId ?? null,
      };
    });
    if (resultado.archivoId) {
      await rm(join(this.archivosDir, 'cuarentena', resultado.archivoId), { force: true });
    }
    return resultado.confirmacion;
  }

  /**
   * La descarga de la exportación: un solo uso, 10 min. Queda en la bitácora (Flujos §4.4). Las
   * fotos (HU-324) dicen desde dónde: el panel o la consola.
   */
  async download(
    contexto: Pick<ContextoEvento, 'organizacionId' | 'eventoId'>,
    id: string,
    token: string,
    actor: ActorBitacora,
  ): Promise<{ datos: Buffer; tipo: string; fotos: number }> {
    let ruta = '';
    const contenido = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const operacion = await this.getOperacion(tx, contexto, id, true);
      ruta = join(
        this.archivosDir,
        'exportaciones',
        `${id}.${operacion.tipo === 'export-fotos' ? 'zip' : 'csv'}`,
      );
      const valido =
        EXPORTACIONES.has(operacion.tipo) &&
        operacion.estado === 'lista' &&
        !operacion.descargadaAt &&
        operacion.descargaTokenHash !== null &&
        hashToken(token).equals(operacion.descargaTokenHash) &&
        (operacion.descargaExpiraAt?.getTime() ?? 0) > this.reloj.now().getTime();
      if (!valido) {
        throw new AppError(operacion.descargadaAt ? 'ENLACE_YA_USADO' : 'ENLACE_VENCIDO');
      }
      const datos = await readFile(ruta);
      await tx
        .update(operaciones)
        .set({ descargadaAt: this.reloj.now(), descargaTokenHash: null })
        .where(eq(operaciones.id, id));
      if (operacion.tipo === 'export-fotos') {
        const desde = (operacion.parametros as { desde?: string }).desde ?? 'panel';
        const entrada = {
          actor,
          accion: 'foto.descargar' as const,
          objeto: { tipo: 'operacion', id, nombre: 'Fotos para redes' },
          despues: { fotos: (operacion.resultado as { fotos?: number } | null)?.fotos ?? 0, desde },
        };
        await this.bitacora.record(tx, {
          ...entrada,
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
        });
      } else {
        await this.bitacora.record(tx, {
          actor,
          accion: 'invitados.export',
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          objeto: { tipo: 'operacion', id, nombre: 'Lista de invitados' },
          despues: { filas: (operacion.resultado as { filas?: number } | null)?.filas ?? 0 },
        });
      }
      return {
        datos,
        tipo: operacion.tipo,
        fotos: (operacion.resultado as { fotos?: number } | null)?.fotos ?? 0,
      };
    });
    await rm(ruta, { force: true });
    return contenido;
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  private create(
    contexto: Pick<ContextoEvento, 'organizacionId' | 'eventoId' | 'usuarioId'>,
    tipo: 'import-asistentes' | 'export-asistentes' | 'export-fotos',
    parametros: Record<string, unknown>,
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const id = uuidv7();
      await tx.insert(operaciones).values({
        id,
        tipo,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        parametros,
        createdBy: contexto.usuarioId,
        expiraAt: new Date(this.reloj.now().getTime() + VIGENCIA_OPERACION_MS),
      });
      return { operacionId: id };
    });
  }

  private async findRepetidos(tx: Tx, contexto: ContextoEvento, filas: readonly FilaCsv[]) {
    const emails = filas.flatMap((f) => (f.email ? [f.email] : []));
    const codigos = filas.flatMap((f) => (f.codigoExterno ? [f.codigoExterno] : []));
    const porEmail = new Map<string, string>();
    const porCodigo = new Map<string, string>();
    if (emails.length === 0 && codigos.length === 0) return { porEmail, porCodigo };
    const existentes = await tx
      .select({
        codigo: asistentes.codigoAsistente,
        email: asistentes.email,
        codigoExterno: asistentes.codigoExterno,
      })
      .from(asistentes)
      .where(
        and(
          eq(asistentes.eventoId, contexto.eventoId),
          or(
            emails.length > 0
              ? and(isNotNull(asistentes.email), inArray(asistentes.email, emails))
              : undefined,
            codigos.length > 0 ? inArray(asistentes.codigoExterno, codigos) : undefined,
          ),
        ),
      );
    for (const e of existentes) {
      if (e.email) porEmail.set(e.email.toLowerCase(), e.codigo);
      if (e.codigoExterno) porCodigo.set(e.codigoExterno, e.codigo);
    }
    return { porEmail, porCodigo };
  }

  private async getOperacion(
    tx: Tx,
    contexto: Pick<ContextoEvento, 'eventoId'>,
    id: string,
    bloquear = false,
  ): Promise<Operacion> {
    const consulta = tx.select().from(operaciones).where(eq(operaciones.id, id));
    const [operacion] = bloquear ? await consulta.for('update') : await consulta;
    if (operacion?.eventoId !== contexto.eventoId) {
      throw new AppError('NO_ENCONTRADO');
    }
    return operacion;
  }
}
