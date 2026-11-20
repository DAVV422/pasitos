import { and, asc, desc, eq, gt, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { eventos, organizaciones, type Db } from '@pasitos/db';
import type { Reloj } from '../auth/sesiones.service';
import { getEventoPublico, getIdEventoPublico } from './evento-publico';
import { getReportePublico } from './reporte-publico';

export type MomentoEvento = 'proximos' | 'en_curso' | 'pasados';

const POR_PAGINA_MAX = 24;

/** Un evento en la sección *Eventos* (HU-405 §2). Solo lo público. */
export interface EventoPublico {
  readonly slug: string;
  readonly nombre: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly zonaHoraria: string;
  /** Solo si la sección `lugar` es pública. */
  readonly lugar: string | null;
  readonly organizacion: string;
  readonly imagen: string | null;
  readonly estado: 'proximo' | 'en_curso' | 'terminado';
}

/**
 * Lo público de los eventos (HU-405 y HU-406), con la conexión de sistema: no hay organización.
 * Solo eventos `real` con visibilidad *Público* y fuera de borrador (D37, D52). **Solo las columnas
 * de la lista**, nunca la fila entera.
 */
export class EventosPublicosService {
  constructor(
    private readonly sistema: Db,
    private readonly reloj: Reloj,
    private readonly opciones: { readonly red: 'local' | 'testnet'; readonly llaveDatos: string },
  ) {}

  /** La página pública de un evento (HU-406). */
  get(slug: string) {
    return getEventoPublico(this.sistema, slug, this.opciones.llaveDatos);
  }

  /** El reporte compartido con un enlace (HU-402 §5). `null`: no existe o ya no se comparte. */
  getReporte(token: string) {
    return getReportePublico(this.sistema, token, this.opciones.red);
  }

  /** El id del evento si tiene página pública; si no, `null` (HU-406, *Ir a mi entrada*). */
  getId(slug: string): Promise<string | null> {
    return getIdEventoPublico(this.sistema, slug);
  }

  async list(momento: MomentoEvento, opciones: { cursor?: string | undefined; limit: number }) {
    const ahora = this.reloj.now();
    const limit = Math.min(Math.max(opciones.limit, 1), POR_PAGINA_MAX);
    const condiciones: SQL[] = [eq(eventos.tipo, 'real'), eq(eventos.visibilidad, 'publico')];
    // El orden y el cursor (`<fecha ISO>_<id>`) dependen del momento.
    const columnaOrden = momento === 'pasados' ? eventos.cerradoAt : eventos.inicioAt;
    if (momento === 'proximos') {
      condiciones.push(eq(eventos.estado, 'publicado'), gt(eventos.inicioAt, ahora));
    } else if (momento === 'en_curso') {
      condiciones.push(inArray(eventos.estado, ['en_curso', 'pausado']));
    } else {
      condiciones.push(inArray(eventos.estado, ['cerrado', 'archivado']));
    }
    const cursor = parseCursor(opciones.cursor);
    if (cursor) {
      condiciones.push(
        momento === 'pasados'
          ? (or(
              lt(columnaOrden, cursor.fecha),
              and(eq(columnaOrden, cursor.fecha), lt(eventos.id, cursor.id)),
            ) as SQL)
          : (or(
              gt(columnaOrden, cursor.fecha),
              and(eq(columnaOrden, cursor.fecha), gt(eventos.id, cursor.id)),
            ) as SQL),
      );
    }
    const filas = await this.sistema
      .select({
        id: eventos.id,
        slug: eventos.slug,
        nombre: eventos.nombre,
        inicioAt: eventos.inicioAt,
        finAt: eventos.finAt,
        cerradoAt: eventos.cerradoAt,
        zonaHoraria: eventos.zonaHoraria,
        estado: eventos.estado,
        lugarNombre: eventos.lugarNombre,
        lugarPublico: sql<boolean>`'lugar' = any(${eventos.seccionesPublicas})`,
        portadaArchivoId: eventos.portadaArchivoId,
        logoArchivoId: eventos.logoArchivoId,
        organizacion: organizaciones.nombre,
      })
      .from(eventos)
      .innerJoin(organizaciones, eq(organizaciones.id, eventos.organizacionId))
      .where(and(...condiciones))
      .orderBy(
        momento === 'pasados' ? desc(columnaOrden) : asc(columnaOrden),
        momento === 'pasados' ? desc(eventos.id) : asc(eventos.id),
      )
      .limit(limit + 1);
    const pagina = filas.slice(0, limit);
    const ultimo = pagina.at(-1);
    const fechaUltimo = ultimo && (momento === 'pasados' ? ultimo.cerradoAt : ultimo.inicioAt);
    return {
      items: pagina.map((f): EventoPublico => ({
        slug: f.slug,
        nombre: f.nombre,
        inicioAt: f.inicioAt.toISOString(),
        finAt: f.finAt.toISOString(),
        zonaHoraria: f.zonaHoraria,
        lugar: f.lugarPublico ? f.lugarNombre : null,
        organizacion: f.organizacion,
        imagen:
          f.portadaArchivoId || f.logoArchivoId
            ? `/api/v1/archivos/${f.portadaArchivoId ?? f.logoArchivoId}/1200`
            : null,
        estado:
          f.estado === 'en_curso' || f.estado === 'pausado'
            ? 'en_curso'
            : f.estado === 'publicado'
              ? 'proximo'
              : 'terminado',
      })),
      pagination: {
        nextCursor:
          filas.length > limit && ultimo && fechaUltimo
            ? `${fechaUltimo.toISOString()}_${ultimo.id}`
            : null,
      },
    };
  }
}

function parseCursor(cursor: string | undefined): { fecha: Date; id: string } | null {
  if (!cursor) return null;
  const [fecha, id] = cursor.split('_');
  if (!fecha || !id || !/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(Date.parse(fecha))) return null;
  return { fecha: new Date(fecha), id };
}
