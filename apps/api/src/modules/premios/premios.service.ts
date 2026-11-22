import { and, asc, eq, max } from 'drizzle-orm';
import { grupos, premios, withOrganizacion, type Db, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { DatosPremio } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { ArchivosService } from '../archivos/archivos.service';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, diff } from '../bitacora/bitacora.service';

type Premio = typeof premios.$inferSelect;
type Accion = 'premio.create' | 'premio.update' | 'premio.delete' | 'premio.hide' | 'premio.show';

/**
 * Catálogo de canje (HU-208). El stock nunca baja de lo reservado y entregado; la fila del premio
 * se bloquea (`FOR UPDATE`), la misma que bloquea un cobro (fase 3), así no se pisan. Cambiar el
 * precio vale para los cobros siguientes.
 */
export class PremiosService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly archivos: ArchivosService,
    private readonly reloj: Reloj,
  ) {}

  list(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select()
        .from(premios)
        .where(eq(premios.eventoId, contexto.eventoId))
        .orderBy(asc(premios.orden), asc(premios.nombre));
      return filas.map((p) => this.toPremio(p));
    });
  }

  async create(contexto: ContextoEvento, datos: DatosPremio) {
    await this.checkImagen(contexto, datos.imagenArchivoId);
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await this.checkGrupo(tx, contexto, datos.puntos, datos.grupoId);
      checkHorario(datos.disponibleDesde, datos.disponibleHasta);
      const [ultimo] = await tx
        .select({ orden: max(premios.orden) })
        .from(premios)
        .where(eq(premios.eventoId, contexto.eventoId));
      const id = uuidv7();
      await tx.insert(premios).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        ...toColumnas(datos),
        orden: Number(ultimo?.orden ?? -1) + 1,
      });
      await this.record(tx, contexto, 'premio.create', id, datos.nombre, undefined, datos);
      return this.toPremio(await this.getPremio(tx, contexto, id));
    });
  }

  async update(contexto: ContextoEvento, id: string, cambios: Partial<DatosPremio>) {
    await this.checkImagen(contexto, cambios.imagenArchivoId ?? null);
    const resultado = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getPremio(tx, contexto, id, true);
      await this.checkGrupo(
        tx,
        contexto,
        cambios.puntos ?? actual.puntos,
        cambios.grupoId === undefined ? actual.grupoId : cambios.grupoId,
      );
      checkHorario(
        cambios.disponibleDesde === undefined
          ? (actual.disponibleDesde?.toISOString() ?? null)
          : cambios.disponibleDesde,
        cambios.disponibleHasta === undefined
          ? (actual.disponibleHasta?.toISOString() ?? null)
          : cambios.disponibleHasta,
      );
      const comprometido = actual.stockReservado + actual.stockEntregado;
      if (cambios.stockTotal !== undefined && cambios.stockTotal < comprometido) {
        throw new AppError('STOCK_MENOR_A_COMPROMETIDO', {
          meta: { minimo: comprometido },
          detail: `El stock no puede ser menor que ${comprometido} (reservado y entregado).`,
        });
      }
      await tx
        .update(premios)
        .set({ ...toColumnas(cambios), updatedAt: this.reloj.now() })
        .where(eq(premios.id, id));
      const recortado = diff(this.toDatos(actual), { ...this.toDatos(actual), ...cambios });
      if (Object.keys(recortado.despues).length > 0) {
        await this.record(
          tx,
          contexto,
          'premio.update',
          id,
          cambios.nombre ?? actual.nombre,
          recortado.antes,
          recortado.despues,
        );
      }
      return {
        anterior: actual.imagenArchivoId,
        premio: this.toPremio(await this.getPremio(tx, contexto, id)),
      };
    });
    if (cambios.imagenArchivoId !== undefined && cambios.imagenArchivoId !== resultado.anterior) {
      await this.archivos.markReemplazado(contexto, resultado.anterior);
    }
    return resultado.premio;
  }

  /** Con algún canje (reservado o entregado) no se borra: se oculta (HU-208 §2). */
  async delete(contexto: ContextoEvento, id: string): Promise<void> {
    await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getPremio(tx, contexto, id, true);
      if (actual.stockReservado + actual.stockEntregado > 0) {
        throw new AppError('PREMIO_CON_CANJES');
      }
      await tx.delete(premios).where(eq(premios.id, id));
      await this.record(
        tx,
        contexto,
        'premio.delete',
        id,
        actual.nombre,
        this.toDatos(actual),
        undefined,
      );
    });
  }

  /** Oculto no aparece en la mesa ni en la app (fase 3). */
  async setVisible(contexto: ContextoEvento, id: string, visible: boolean) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getPremio(tx, contexto, id, true);
      const estado = visible ? 'activo' : 'oculto';
      if (actual.estado !== estado) {
        await tx
          .update(premios)
          .set({ estado, updatedAt: this.reloj.now() })
          .where(eq(premios.id, id));
        await this.record(
          tx,
          contexto,
          visible ? 'premio.show' : 'premio.hide',
          id,
          actual.nombre,
          { estado: actual.estado },
          { estado },
        );
      }
      return this.toPremio(await this.getPremio(tx, contexto, id));
    });
  }

  private async checkImagen(contexto: ContextoEvento, id: string | null) {
    if (id) {
      await this.archivos.checkUsable(contexto, id, 'imagen_premio', 'imagenArchivoId');
    }
  }

  private async getPremio(
    tx: Tx,
    contexto: ContextoEvento,
    id: string,
    bloquear = false,
  ): Promise<Premio> {
    const consulta = tx.select().from(premios).where(eq(premios.id, id));
    const [premio] = bloquear ? await consulta.for('update') : await consulta;
    if (!premio || premio.eventoId !== contexto.eventoId) {
      throw new AppError('NO_ENCONTRADO');
    }
    return premio;
  }

  private toDatos(p: Premio): DatosPremio {
    return {
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenArchivoId: p.imagenArchivoId,
      puntos: p.puntos,
      stockTotal: p.stockTotal,
      maxPorPersona: p.maxPorPersona,
      grupoId: p.grupoId,
      requiereCi: p.requiereCi,
      disponibleDesde: p.disponibleDesde?.toISOString() ?? null,
      disponibleHasta: p.disponibleHasta?.toISOString() ?? null,
    };
  }

  /** HU-325: el grupo es del evento, y el precio 0 solo vale con grupo (un souvenir). */
  private async checkGrupo(
    tx: Tx,
    contexto: ContextoEvento,
    puntos: number,
    grupoId: string | null,
  ): Promise<void> {
    if (grupoId) {
      const [grupo] = await tx
        .select({ id: grupos.id })
        .from(grupos)
        .where(and(eq(grupos.id, grupoId), eq(grupos.eventoId, contexto.eventoId)));
      if (!grupo) {
        throw new AppError('VALIDACION', {
          errors: [{ field: 'grupoId', code: 'NO_VALIDO', message: 'No es de este evento.' }],
        });
      }
    }
    if (puntos === 0 && !grupoId) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'puntos',
            code: 'NO_VALIDO',
            message: 'Solo un premio de un grupo puede ser gratis. Elige el grupo o pon un precio.',
          },
        ],
      });
    }
  }

  private toPremio(p: Premio) {
    return {
      id: p.id,
      ...this.toDatos(p),
      stockReservado: p.stockReservado,
      stockEntregado: p.stockEntregado,
      disponible: p.stockTotal - p.stockReservado - p.stockEntregado,
      estado: p.estado,
      orden: p.orden,
    };
  }

  private record(
    tx: Tx,
    contexto: ContextoEvento,
    accion: Accion,
    id: string,
    nombre: string,
    antes?: Record<string, unknown>,
    despues?: Record<string, unknown>,
  ) {
    return this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: 'premio', id, nombre },
      ...(antes ? { antes } : {}),
      ...(despues ? { despues } : {}),
    });
  }
}

/** HU-413: el horario llega como texto ISO; la base guarda fechas. */
function toColumnas<T extends Partial<DatosPremio>>(datos: T) {
  const { disponibleDesde, disponibleHasta, ...resto } = datos;
  return {
    ...resto,
    ...(disponibleDesde === undefined
      ? {}
      : { disponibleDesde: disponibleDesde ? new Date(disponibleDesde) : null }),
    ...(disponibleHasta === undefined
      ? {}
      : { disponibleHasta: disponibleHasta ? new Date(disponibleHasta) : null }),
  };
}

/** HU-413: *Hasta* después de *Desde* (si están los dos). */
function checkHorario(desde: string | null | undefined, hasta: string | null | undefined): void {
  if (desde && hasta && !(new Date(desde) < new Date(hasta))) {
    throw new AppError('VALIDACION', {
      errors: [
        {
          field: 'disponibleHasta',
          code: 'NO_VALIDO',
          message: 'El final tiene que ser después del comienzo.',
        },
      ],
    });
  }
}
