import { and, eq } from 'drizzle-orm';
import { actividades, eventos, lugares, premios, retos, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { getUrlArchivo } from '../archivos/archivos.service';

/**
 * Lo que casi no cambia (`GET /app/evento`, API §5.2): la definición de los retos y los premios y
 * la agenda. Es la base que usa *Inicio* (HU-308); HU-309 suma la información, el plano, los
 * sponsors, las preguntas, la caché del servidor y el service worker.
 */
export interface EventoApp {
  readonly id: string;
  readonly nombre: string;
  readonly logoUrl: string | null;
  readonly retos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly puntos: number;
    readonly tipo: string;
    readonly lugar: string | null;
    readonly disponibleDesde: string | null;
    readonly disponibleHasta: string | null;
  }[];
  readonly premios: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly imagenUrl: string | null;
    readonly puntos: number;
    readonly maxPorPersona: number | null;
  }[];
  readonly agenda: readonly {
    readonly id: string;
    readonly titulo: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly lugar: string | null;
    readonly expositor: string | null;
    readonly retoId: string | null;
  }[];
}

export async function getEventoApp(tx: Tx, eventoId: string): Promise<EventoApp> {
  const [evento] = await tx
    .select({ id: eventos.id, nombre: eventos.nombre, logoArchivoId: eventos.logoArchivoId })
    .from(eventos)
    .where(eq(eventos.id, eventoId));
  if (!evento) {
    throw new AppError('NO_ENCONTRADO');
  }
  const [filasRetos, filasPremios, filasAgenda] = await Promise.all([
    tx
      .select({
        id: retos.id,
        nombre: retos.nombre,
        descripcion: retos.descripcion,
        puntos: retos.puntos,
        tipo: retos.tipo,
        lugar: lugares.nombre,
        disponibleDesde: retos.disponibleDesde,
        disponibleHasta: retos.disponibleHasta,
      })
      .from(retos)
      .leftJoin(lugares, eq(lugares.id, retos.lugarId))
      .where(eq(retos.eventoId, eventoId))
      .orderBy(retos.numero),
    tx
      .select({
        id: premios.id,
        nombre: premios.nombre,
        descripcion: premios.descripcion,
        imagenArchivoId: premios.imagenArchivoId,
        puntos: premios.puntos,
        maxPorPersona: premios.maxPorPersona,
      })
      .from(premios)
      .where(and(eq(premios.eventoId, eventoId), eq(premios.estado, 'activo')))
      .orderBy(premios.orden, premios.id),
    tx
      .select({
        id: actividades.id,
        titulo: actividades.titulo,
        inicioAt: actividades.inicioAt,
        finAt: actividades.finAt,
        lugar: lugares.nombre,
        expositor: actividades.expositor,
        retoId: actividades.retoId,
      })
      .from(actividades)
      .leftJoin(lugares, eq(lugares.id, actividades.lugarId))
      .where(eq(actividades.eventoId, eventoId))
      .orderBy(actividades.inicioAt, actividades.id),
  ]);
  return {
    id: evento.id,
    nombre: evento.nombre,
    logoUrl: evento.logoArchivoId ? getUrlArchivo(evento.logoArchivoId, '400') : null,
    retos: filasRetos.map((reto) => ({
      ...reto,
      disponibleDesde: reto.disponibleDesde?.toISOString() ?? null,
      disponibleHasta: reto.disponibleHasta?.toISOString() ?? null,
    })),
    premios: filasPremios.map(({ imagenArchivoId, ...premio }) => ({
      ...premio,
      imagenUrl: imagenArchivoId ? getUrlArchivo(imagenArchivoId, '400') : null,
    })),
    agenda: filasAgenda.map((actividad) => ({
      ...actividad,
      inicioAt: actividad.inicioAt.toISOString(),
      finAt: actividad.finAt.toISOString(),
    })),
  };
}
