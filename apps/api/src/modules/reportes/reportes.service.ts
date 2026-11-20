import { createHash, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { eventos, reportes, withOrganizacion, type Db, type Tx } from '@pasitos/db';
import {
  AppError,
  buildCsvReporte,
  validateTramo,
  VERSION_REPORTE,
  type DatosReporte,
  type ReportePanel,
  type TramoReporte,
} from '@pasitos/dominio';
import type { DatosCompartirReporte } from '@pasitos/dominio/esquemas';
import { buildDatosReporte, getLimitesReporte, getStellarReporte } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { renderPdfReporte } from './reporte-pdf';

export interface OpcionesReportes {
  readonly red: 'local' | 'testnet';
  readonly publicUrl: string;
  /** Para calcular el token del enlace público (HMAC): así se puede volver a mostrar. */
  readonly llaveDatos: string;
}

type FilaReporte = typeof reportes.$inferSelect;

/** El token del enlace público: un HMAC del reporte y la versión del enlace (32 bytes). */
export function getTokenReporte(llave: string, reporteId: string, version: number): string {
  return createHmac('sha256', llave).update(`reporte:${reporteId}:${version}`).digest('base64url');
}

export function hashTokenReporte(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/**
 * El reporte del evento (HU-402). Se arma la primera vez que se pide, con el evento ya cerrado, y
 * queda guardado: el evento cerrado ya no cambia. El tramo, el PDF y el CSV se calculan en el
 * momento.
 */
export class ReportesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesReportes,
  ) {}

  get(contexto: ContextoEvento): Promise<ReportePanel> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const { evento, fila } = await this.load(tx, contexto);
      return this.toPanel(tx, evento.tipo, fila);
    });
  }

  /** El reporte de un tramo (§3.1): se calcula con lo que pasó dentro del tramo. */
  getTramo(contexto: ContextoEvento, tramo: TramoReporte): Promise<DatosReporte> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await this.getEventoCerrado(tx, contexto.eventoId);
      return this.buildTramo(tx, contexto.eventoId, tramo);
    });
  }

  regenerate(contexto: ContextoEvento): Promise<ReportePanel> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEventoCerrado(tx, contexto.eventoId);
      const fila = await this.save(tx, contexto, evento.id);
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'reporte.regenerar',
        organizacionId: contexto.organizacionId,
        eventoId: evento.id,
        objeto: { tipo: 'reporte', id: fila.id, nombre: evento.nombre },
      });
      return this.toPanel(tx, evento.tipo, fila);
    });
  }

  /** Compartir, dejar de compartir y cambiar el enlace (§5). Solo el dueño. */
  share(contexto: ContextoEvento, datos: DatosCompartirReporte): Promise<ReportePanel> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const { evento, fila } = await this.load(tx, contexto);
      if (datos.publico && evento.tipo === 'demo') throw new AppError('REPORTE_NO_COMPARTIBLE');
      const cambiar = datos.publico && (fila.tokenPublicoHash === null || datos.cambiarEnlace);
      const version =
        cambiar && fila.tokenPublicoHash !== null ? fila.enlaceVersion + 1 : fila.enlaceVersion;
      const hash = datos.publico
        ? hashTokenReporte(getTokenReporte(this.opciones.llaveDatos, fila.id, version))
        : fila.tokenPublicoHash;
      const ahora = this.reloj.now();
      const [nueva] = await tx
        .update(reportes)
        .set({
          publico: datos.publico,
          tokenPublicoHash: hash,
          enlaceVersion: version,
          ...(datos.publico && !fila.publico
            ? { publicadoAt: ahora, publicadoPor: contexto.usuarioId }
            : {}),
          updatedAt: ahora,
        })
        .where(eq(reportes.id, fila.id))
        .returning();
      const accion = !datos.publico
        ? 'reporte.despublicar'
        : fila.publico && version !== fila.enlaceVersion
          ? 'reporte.cambiar_enlace'
          : 'reporte.publicar';
      if (datos.publico !== fila.publico || version !== fila.enlaceVersion) {
        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion,
          organizacionId: contexto.organizacionId,
          eventoId: evento.id,
          objeto: { tipo: 'reporte', id: fila.id, nombre: evento.nombre },
          antes: { publico: fila.publico },
          despues: { publico: datos.publico },
        });
      }
      return this.toPanel(tx, evento.tipo, nueva ?? fila);
    });
  }

  /** El PDF de una página, siempre del evento completo (§8). */
  getPdf(contexto: ContextoEvento): Promise<{ contenido: Buffer; archivo: string }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const { evento, fila } = await this.load(tx, contexto);
      const stellar = await getStellarReporte(tx, evento.id, this.opciones.red);
      const contenido = renderPdfReporte(fila.datos as DatosReporte, stellar, this.getEnlace(fila));
      await this.recordDescarga(tx, contexto, fila, evento.nombre, 'pdf', null);
      return { contenido, archivo: `reporte-${evento.slug}.pdf` };
    });
  }

  /** El CSV, del evento completo o del tramo elegido (§3.1). */
  getCsv(
    contexto: ContextoEvento,
    tramo: TramoReporte | null,
  ): Promise<{ contenido: string; archivo: string }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const { evento, fila } = await this.load(tx, contexto);
      const datos = tramo
        ? await this.buildTramo(tx, evento.id, tramo)
        : (fila.datos as DatosReporte);
      const stellar = tramo ? null : await getStellarReporte(tx, evento.id, this.opciones.red);
      await this.recordDescarga(tx, contexto, fila, evento.nombre, 'csv', tramo);
      return { contenido: buildCsvReporte(datos, stellar), archivo: `reporte-${evento.slug}.csv` };
    });
  }

  private async buildTramo(tx: Tx, eventoId: string, tramo: TramoReporte) {
    const limites = await getLimitesReporte(tx, eventoId);
    if (!limites || validateTramo(tramo, limites)) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'desde',
            code: 'FUERA_DEL_EVENTO',
            message: 'El tramo tiene que estar dentro del evento, de a 15 minutos.',
          },
        ],
      });
    }
    const normalizado = {
      desde: new Date(tramo.desde).toISOString(),
      hasta: new Date(tramo.hasta).toISOString(),
    };
    const datos = await buildDatosReporte(tx, eventoId, normalizado, this.reloj.now());
    if (!datos) throw new AppError('NO_ENCONTRADO');
    return datos;
  }

  private async recordDescarga(
    tx: Tx,
    contexto: ContextoEvento,
    fila: FilaReporte,
    nombre: string,
    formato: 'pdf' | 'csv',
    tramo: TramoReporte | null,
  ) {
    await this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion: 'reporte.descargar',
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: 'reporte', id: fila.id, nombre },
      despues: { formato, tramo },
    });
  }

  private async getEventoCerrado(tx: Tx, eventoId: string) {
    const [evento] = await tx
      .select({
        id: eventos.id,
        nombre: eventos.nombre,
        slug: eventos.slug,
        tipo: eventos.tipo,
        estado: eventos.estado,
      })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    if (!evento) throw new AppError('NO_ENCONTRADO');
    if (evento.estado !== 'cerrado') throw new AppError('REPORTE_NO_DISPONIBLE');
    return evento;
  }

  /** El reporte guardado; si no está (o es de un formato viejo), se arma ahora. */
  private async load(tx: Tx, contexto: ContextoEvento) {
    const evento = await this.getEventoCerrado(tx, contexto.eventoId);
    const [guardado] = await tx.select().from(reportes).where(eq(reportes.eventoId, evento.id));
    const fila =
      guardado && guardado.version === VERSION_REPORTE
        ? guardado
        : await this.save(tx, contexto, evento.id);
    return { evento, fila };
  }

  private async save(tx: Tx, contexto: ContextoEvento, eventoId: string): Promise<FilaReporte> {
    const ahora = this.reloj.now();
    const datos = await buildDatosReporte(tx, eventoId, null, ahora);
    if (!datos) throw new AppError('NO_ENCONTRADO');
    const [fila] = await tx
      .insert(reportes)
      .values({
        id: uuidv7(),
        organizacionId: contexto.organizacionId,
        eventoId,
        version: VERSION_REPORTE,
        datos,
        generadoAt: ahora,
      })
      .onConflictDoUpdate({
        target: reportes.eventoId,
        set: { version: VERSION_REPORTE, datos, generadoAt: ahora, updatedAt: ahora },
      })
      .returning();
    if (!fila) throw new AppError('ERROR_INTERNO');
    return fila;
  }

  private getEnlace(fila: FilaReporte): string | null {
    if (!fila.publico) return null;
    const token = getTokenReporte(this.opciones.llaveDatos, fila.id, fila.enlaceVersion);
    return `${this.opciones.publicUrl}/reporte/${token}`;
  }

  private async toPanel(tx: Tx, tipo: string, fila: FilaReporte): Promise<ReportePanel> {
    return {
      datos: fila.datos as DatosReporte,
      stellar: await getStellarReporte(tx, fila.eventoId, this.opciones.red),
      publico: fila.publico,
      enlacePublico: this.getEnlace(fila),
      compartible: tipo !== 'demo',
    };
  }
}
