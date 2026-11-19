import { and, eq } from 'drizzle-orm';
import {
  actividades,
  eventos,
  lugares,
  preguntasFrecuentes,
  premios,
  retos,
  sponsors,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { getUrlArchivo } from '../archivos/archivos.service';
import { mapGruposDelEvento, whereParaLaPersona } from '../grupos/grupos-de';

/** HU-325: el grupo de un reto o premio exclusivo (*VIP*). */
export interface GrupoApp {
  readonly nombre: string;
  readonly color: string;
}

/**
 * Lo que casi no cambia (`GET /app/evento`, API §5.2, HU-309 §1): la información, el plano, los
 * lugares, los sponsors, las preguntas, la agenda y la definición de los retos y los premios. El
 * wifi va solo aquí (la app del asistente), nunca en la página pública.
 */
export interface EventoApp {
  readonly id: string;
  readonly nombre: string;
  readonly logoUrl: string | null;
  readonly info: {
    readonly descripcion: string | null;
    readonly contacto: string | null;
    readonly wifi: string | null;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly lugarNombre: string | null;
    readonly lugarDireccion: string | null;
    readonly portadaUrl: string | null;
    readonly planoUrl: string | null;
    readonly nombrePuntos: string;
  };
  readonly lugares: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly tipo: string;
    readonly numeroMapa: number | null;
    readonly descripcion: string | null;
  }[];
  readonly sponsors: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly logoUrl: string | null;
    readonly descripcion: string | null;
    readonly enlace: string | null;
    readonly lugar: string | null;
  }[];
  readonly preguntas: readonly { readonly pregunta: string; readonly respuesta: string }[];
  readonly retos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly puntos: number;
    readonly tipo: string;
    readonly lugar: string | null;
    readonly lugarId: string | null;
    readonly sponsorId: string | null;
    readonly grupo: GrupoApp | null;
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
    readonly grupo: GrupoApp | null;
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

/**
 * HU-325: solo los retos y premios sin grupo o de los grupos de la persona (`grupoIds`). La caché
 * guarda una respuesta por combinación de grupos.
 */
export async function getEventoApp(
  tx: Tx,
  eventoId: string,
  grupoIds: readonly string[] = [],
): Promise<EventoApp> {
  const [evento] = await tx
    .select({
      id: eventos.id,
      nombre: eventos.nombre,
      logoArchivoId: eventos.logoArchivoId,
      portadaArchivoId: eventos.portadaArchivoId,
      planoArchivoId: eventos.planoArchivoId,
      descripcion: eventos.descripcion,
      contacto: eventos.contacto,
      wifi: eventos.wifi,
      inicioAt: eventos.inicioAt,
      finAt: eventos.finAt,
      lugarNombre: eventos.lugarNombre,
      lugarDireccion: eventos.lugarDireccion,
      nombrePuntos: eventos.nombrePuntos,
    })
    .from(eventos)
    .where(eq(eventos.id, eventoId));
  if (!evento) {
    throw new AppError('NO_ENCONTRADO');
  }
  const [filasRetos, filasPremios, filasAgenda, filasLugares, filasSponsors, filasPreguntas] =
    await Promise.all([
      tx
        .select({
          id: retos.id,
          nombre: retos.nombre,
          descripcion: retos.descripcion,
          puntos: retos.puntos,
          tipo: retos.tipo,
          lugar: lugares.nombre,
          lugarId: retos.lugarId,
          sponsorId: retos.sponsorId,
          grupoId: retos.grupoId,
          disponibleDesde: retos.disponibleDesde,
          disponibleHasta: retos.disponibleHasta,
        })
        .from(retos)
        .leftJoin(lugares, eq(lugares.id, retos.lugarId))
        .where(and(eq(retos.eventoId, eventoId), whereParaLaPersona(retos.grupoId, grupoIds)))
        .orderBy(retos.numero),
      tx
        .select({
          id: premios.id,
          nombre: premios.nombre,
          descripcion: premios.descripcion,
          imagenArchivoId: premios.imagenArchivoId,
          puntos: premios.puntos,
          maxPorPersona: premios.maxPorPersona,
          grupoId: premios.grupoId,
        })
        .from(premios)
        .where(
          and(
            eq(premios.eventoId, eventoId),
            eq(premios.estado, 'activo'),
            whereParaLaPersona(premios.grupoId, grupoIds),
          ),
        )
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
      tx
        .select({
          id: lugares.id,
          nombre: lugares.nombre,
          tipo: lugares.tipo,
          numeroMapa: lugares.numeroMapa,
          descripcion: lugares.descripcion,
        })
        .from(lugares)
        .where(eq(lugares.eventoId, eventoId))
        .orderBy(lugares.numeroMapa, lugares.nombre),
      tx
        .select({
          id: sponsors.id,
          nombre: sponsors.nombre,
          logoArchivoId: sponsors.logoArchivoId,
          descripcion: sponsors.descripcion,
          enlace: sponsors.enlace,
          lugar: lugares.nombre,
        })
        .from(sponsors)
        .leftJoin(lugares, eq(lugares.id, sponsors.lugarId))
        .where(eq(sponsors.eventoId, eventoId))
        .orderBy(sponsors.orden, sponsors.id),
      tx
        .select({
          pregunta: preguntasFrecuentes.pregunta,
          respuesta: preguntasFrecuentes.respuesta,
        })
        .from(preguntasFrecuentes)
        .where(eq(preguntasFrecuentes.eventoId, eventoId))
        .orderBy(preguntasFrecuentes.orden, preguntasFrecuentes.id),
    ]);
  const delEvento = await mapGruposDelEvento(tx, eventoId);
  const toGrupo = (id: string | null): GrupoApp | null => {
    const grupo = id ? delEvento.get(id) : undefined;
    return grupo ? { nombre: grupo.nombre, color: grupo.color } : null;
  };
  return {
    id: evento.id,
    nombre: evento.nombre,
    logoUrl: evento.logoArchivoId ? getUrlArchivo(evento.logoArchivoId, '400') : null,
    info: {
      descripcion: evento.descripcion,
      contacto: evento.contacto,
      wifi: evento.wifi,
      inicioAt: evento.inicioAt.toISOString(),
      finAt: evento.finAt.toISOString(),
      lugarNombre: evento.lugarNombre,
      lugarDireccion: evento.lugarDireccion,
      portadaUrl: evento.portadaArchivoId ? getUrlArchivo(evento.portadaArchivoId, '1200') : null,
      // El plano en 1200 (HU-309 §1); las listas en 400.
      planoUrl: evento.planoArchivoId ? getUrlArchivo(evento.planoArchivoId, '1200') : null,
      nombrePuntos: evento.nombrePuntos,
    },
    lugares: filasLugares,
    sponsors: filasSponsors.map(({ logoArchivoId, ...s }) => ({
      ...s,
      logoUrl: logoArchivoId ? getUrlArchivo(logoArchivoId, '400') : null,
    })),
    preguntas: filasPreguntas,
    retos: filasRetos.map(({ grupoId, ...reto }) => ({
      ...reto,
      grupo: toGrupo(grupoId),
      disponibleDesde: reto.disponibleDesde?.toISOString() ?? null,
      disponibleHasta: reto.disponibleHasta?.toISOString() ?? null,
    })),
    premios: filasPremios.map(({ imagenArchivoId, grupoId, ...premio }) => ({
      ...premio,
      grupo: toGrupo(grupoId),
      imagenUrl: imagenArchivoId ? getUrlArchivo(imagenArchivoId, '400') : null,
    })),
    agenda: filasAgenda.map((actividad) => ({
      ...actividad,
      inicioAt: actividad.inicioAt.toISOString(),
      finAt: actividad.finAt.toISOString(),
    })),
  };
}
