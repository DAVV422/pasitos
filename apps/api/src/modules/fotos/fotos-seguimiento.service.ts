import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { normalize, resolve, sep } from 'node:path';
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';
import {
  archivos,
  asistentes,
  enviosFoto,
  eventos,
  operaciones,
  retos,
  usuarios,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, canDo, DIAS_BORRADO_FOTOS, type VarianteImagen } from '@pasitos/dominio';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { ContextoAsistente } from '../../common/sesion/asistente';
import type { Reloj } from '../auth/sesiones.service';
import { BitacoraService } from '../bitacora/bitacora.service';
import { getNombreCorto } from '../puerta/check-in.service';
import type { FotosRevisionService } from './fotos-revision.service';

const POR_PAGINA = 50;
const DIA_MS = 86_400_000;

export interface FiltrosFotos {
  readonly reto?: string | undefined;
  readonly estado?: string | undefined;
  readonly revisor?: string | undefined;
  readonly origen?: string | undefined;
  readonly autoriza?: 'si' | 'no' | undefined;
  readonly cursor?: string | undefined;
}

/** Una foto en la lista del panel (HU-324 §1). */
export interface FotoPanel {
  readonly id: string;
  readonly miniatura: string | null;
  readonly reto: { readonly id: string; readonly nombre: string };
  readonly asistente: { readonly id: string; readonly nombre: string; readonly codigo: string };
  readonly intento: number;
  readonly estado: string;
  readonly enviadaAt: string;
  readonly revisor: string | null;
  readonly revisorId: string | null;
  readonly revisadaAt: string | null;
  readonly motivo: string | null;
  readonly origen: string;
  readonly autorizaUso: boolean;
  readonly autorizaUsoRetiradaAt: string | null;
  /** Retiró la autorización después de una descarga: *"no la publiques"*. */
  readonly retiradaDespuesDe: string | null;
}

/**
 * El seguimiento de las fotos (HU-324): la lista con filtros, las de una persona, *Mis fotos* en la
 * app con *Retirar autorización* y lo que necesita la descarga para redes.
 */
export class FotosSeguimientoService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly revision: FotosRevisionService,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {}

  /** D y C todas; cada responsable, las de sus retos; el resto, ninguna. */
  list(contexto: ContextoEvento, filtros: FiltrosFotos) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const mios = (await this.revision.listMisRetos(tx, contexto)).map((r) => r.id);
      if (mios.length === 0) {
        return {
          items: [],
          pagination: { nextCursor: null },
          contadores: null,
          borradoAutorizadas: null,
        };
      }
      const condiciones: SQL[] = [
        eq(enviosFoto.eventoId, contexto.eventoId),
        inArray(enviosFoto.retoId, mios),
      ];
      if (filtros.reto) condiciones.push(eq(enviosFoto.retoId, filtros.reto));
      if (filtros.estado) condiciones.push(eq(enviosFoto.estado, filtros.estado));
      if (filtros.revisor) condiciones.push(eq(enviosFoto.revisadaPor, filtros.revisor));
      if (filtros.origen) condiciones.push(eq(enviosFoto.origen, filtros.origen));
      if (filtros.autoriza === 'si') {
        condiciones.push(
          eq(enviosFoto.autorizaUso, true),
          isNull(enviosFoto.autorizaUsoRetiradaAt),
        );
      }
      if (filtros.autoriza === 'no') {
        // Sin autorización, o la retiró.
        condiciones.push(
          or(eq(enviosFoto.autorizaUso, false), isNotNull(enviosFoto.autorizaUsoRetiradaAt)) as SQL,
        );
      }
      if (filtros.cursor) condiciones.push(lt(enviosFoto.id, filtros.cursor));
      const filas = await this.select(tx, and(...condiciones), POR_PAGINA + 1);
      const ultimaDescarga = await this.getUltimaDescarga(tx, contexto.eventoId);
      const pagina = filas.slice(0, POR_PAGINA);
      const items = pagina.map((f) => this.toFoto(f, ultimaDescarga));
      // Los contadores de arriba: *"86 aprobadas · 41 con autorización"*.
      const todas = await tx
        .select({
          retoId: enviosFoto.retoId,
          estado: enviosFoto.estado,
          autoriza: enviosFoto.autorizaUso,
          retirada: enviosFoto.autorizaUsoRetiradaAt,
        })
        .from(enviosFoto)
        .where(and(eq(enviosFoto.eventoId, contexto.eventoId), inArray(enviosFoto.retoId, mios)));
      const aprobadas = todas.filter((t) => t.estado === 'aprobada');
      const conAutorizacion = aprobadas.filter((a) => a.autoriza && !a.retirada);
      const [evento] = await tx
        .select({ cerradoAt: eventos.cerradoAt })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId));
      return {
        items,
        pagination: {
          nextCursor: filas.length > POR_PAGINA ? (pagina.at(-1)?.envio.id ?? null) : null,
        },
        contadores: {
          aprobadas: aprobadas.length,
          conAutorizacion: conAutorizacion.length,
          // Las que bajaría *Descargar*: con el filtro de reto, solo las de ese reto.
          descargables: filtros.reto
            ? conAutorizacion.filter((a) => a.retoId === filtros.reto).length
            : conAutorizacion.length,
        },
        // *"Las fotos autorizadas se borran el 21/02"* (HU-324 §3).
        borradoAutorizadas: evento?.cerradoAt
          ? new Date(
              evento.cerradoAt.getTime() + DIAS_BORRADO_FOTOS.autorizadas * DIA_MS,
            ).toISOString()
          : null,
      };
    });
  }

  /** Las fotos de una persona, para su ficha (D y C). */
  listDeAsistente(contexto: ContextoEvento, asistenteId: string) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await this.select(
        tx,
        and(eq(enviosFoto.eventoId, contexto.eventoId), eq(enviosFoto.asistenteId, asistenteId)),
        200,
      );
      const ultimaDescarga = await this.getUltimaDescarga(tx, contexto.eventoId);
      return { items: filas.map((f) => this.toFoto(f, ultimaDescarga)) };
    });
  }

  /** *Mis fotos* en la app. */
  listMias(asistente: ContextoAsistente) {
    return withOrganizacion(this.db, asistente.organizacionId, async (tx) => {
      const filas = await tx
        .select({
          id: enviosFoto.id,
          reto: retos.nombre,
          estado: enviosFoto.estado,
          motivo: enviosFoto.motivoRechazo,
          autorizaUso: enviosFoto.autorizaUso,
          retiradaAt: enviosFoto.autorizaUsoRetiradaAt,
          enviadaAt: enviosFoto.createdAt,
          archivoEstado: archivos.estado,
        })
        .from(enviosFoto)
        .innerJoin(retos, eq(retos.id, enviosFoto.retoId))
        .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
        .where(eq(enviosFoto.asistenteId, asistente.asistenteId))
        .orderBy(desc(enviosFoto.createdAt));
      return {
        items: filas.map((f) => ({
          id: f.id,
          reto: f.reto,
          estado: f.estado,
          motivo: f.motivo === 'inapropiada' ? 'No es apropiada' : f.motivo,
          autorizaUso: f.autorizaUso && !f.retiradaAt,
          miniatura:
            f.archivoEstado === 'aprobado' && f.motivo !== 'inapropiada'
              ? `/api/v1/app/fotos/${f.id}/imagen/400`
              : null,
          enviadaAt: f.enviadaAt.toISOString(),
        })),
      };
    });
  }

  /**
   * Retirar la autorización (firmado): la foto sale de las descargas siguientes; los puntos no
   * cambian. Si ya se había descargado, la bitácora guarda la fecha de esa descarga.
   */
  withdrawAutorizacion(asistente: ContextoAsistente, id: string) {
    return withOrganizacion(this.db, asistente.organizacionId, async (tx) => {
      const [envio] = await tx
        .select()
        .from(enviosFoto)
        .where(and(eq(enviosFoto.id, id), eq(enviosFoto.asistenteId, asistente.asistenteId)))
        .for('update');
      if (!envio) throw new AppError('NO_ENCONTRADO');
      if (envio.autorizaUso && !envio.autorizaUsoRetiradaAt) {
        const ahora = this.reloj.now();
        await tx
          .update(enviosFoto)
          .set({ autorizaUsoRetiradaAt: ahora, updatedAt: ahora })
          .where(eq(enviosFoto.id, id));
        const ultimaDescarga = await this.getUltimaDescarga(tx, asistente.eventoId);
        await this.bitacora.record(tx, {
          actor: { tipo: 'sistema', nombre: 'La persona, desde la app' },
          accion: 'foto.retirar_autorizacion',
          organizacionId: asistente.organizacionId,
          eventoId: asistente.eventoId,
          objeto: { tipo: 'envio_foto', id, nombre: 'Foto de un reto' },
          despues: {
            ...(ultimaDescarga && envio.estado === 'aprobada'
              ? { descargadaAntesEl: ultimaDescarga.toISOString() }
              : {}),
          },
        });
      }
      return { autorizaUso: false };
    });
  }

  /** La imagen de una foto propia (nunca una inapropiada). */
  async openMia(asistente: ContextoAsistente, id: string, variante: VarianteImagen) {
    const relativa = await withOrganizacion(this.db, asistente.organizacionId, async (tx) => {
      const [fila] = await tx
        .select({
          variantes: archivos.variantes,
          estado: archivos.estado,
          motivo: enviosFoto.motivoRechazo,
        })
        .from(enviosFoto)
        .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
        .where(and(eq(enviosFoto.id, id), eq(enviosFoto.asistenteId, asistente.asistenteId)));
      if (!fila || fila.estado !== 'aprobado' || fila.motivo === 'inapropiada') {
        throw new AppError('NO_ENCONTRADO');
      }
      return (fila.variantes as Partial<Record<VarianteImagen, string>> | null)?.[variante] ?? null;
    });
    if (!relativa) throw new AppError('NO_ENCONTRADO');
    const carpeta = resolve(this.archivosDir, 'eventos');
    const ruta = normalize(resolve(this.archivosDir, relativa));
    if (!ruta.startsWith(carpeta + sep)) throw new AppError('NO_ENCONTRADO');
    const { size } = await stat(ruta).catch(() => {
      throw new AppError('NO_ENCONTRADO');
    });
    return { stream: createReadStream(ruta), tamano: size };
  }

  /** Solo D y C descargan desde el panel; la consola, los administradores de plataforma. */
  checkDescarga(contexto: ContextoEvento): void {
    if (!canDo(contexto.rol, 'fotos.descargar')) throw new AppError('SIN_PERMISO');
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  private select(tx: Tx, donde: SQL | undefined, limite: number) {
    return tx
      .select({
        envio: enviosFoto,
        reto: retos.nombre,
        nombre: asistentes.nombre,
        codigo: asistentes.codigoAsistente,
        revisor: usuarios.nombre,
        archivoEstado: archivos.estado,
      })
      .from(enviosFoto)
      .innerJoin(retos, eq(retos.id, enviosFoto.retoId))
      .innerJoin(asistentes, eq(asistentes.id, enviosFoto.asistenteId))
      .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
      .leftJoin(usuarios, eq(usuarios.id, enviosFoto.revisadaPor))
      .where(donde)
      .orderBy(desc(enviosFoto.id))
      .limit(limite);
  }

  private toFoto(
    fila: Awaited<ReturnType<FotosSeguimientoService['select']>>[number],
    ultimaDescarga: Date | null,
  ): FotoPanel {
    const { envio } = fila;
    const retirada = envio.autorizaUsoRetiradaAt;
    return {
      id: envio.id,
      miniatura: fila.archivoEstado === 'aprobado' ? `/api/v1/fotos/${envio.id}/imagen/400` : null,
      reto: { id: envio.retoId, nombre: fila.reto },
      asistente: { id: envio.asistenteId, nombre: fila.nombre, codigo: fila.codigo },
      intento: envio.intento,
      estado: envio.estado,
      enviadaAt: envio.createdAt.toISOString(),
      revisor: getNombreCorto(fila.revisor),
      revisorId: envio.revisadaPor,
      revisadaAt: envio.revisadaAt?.toISOString() ?? null,
      motivo: envio.motivoRechazo,
      origen: envio.origen,
      autorizaUso: envio.autorizaUso && !retirada,
      autorizaUsoRetiradaAt: retirada?.toISOString() ?? null,
      retiradaDespuesDe:
        retirada && ultimaDescarga && retirada > ultimaDescarga && envio.estado === 'aprobada'
          ? ultimaDescarga.toISOString()
          : null,
    };
  }

  /** La última descarga para redes del evento. */
  private async getUltimaDescarga(tx: Tx, eventoId: string): Promise<Date | null> {
    const [fila] = await tx
      .select({ at: operaciones.descargadaAt })
      .from(operaciones)
      .where(
        and(
          eq(operaciones.eventoId, eventoId),
          eq(operaciones.tipo, 'export-fotos'),
          isNotNull(operaciones.descargadaAt),
        ),
      )
      .orderBy(desc(operaciones.descargadaAt))
      .limit(1);
    return fila?.at ?? null;
  }
}
