import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  actividades,
  eventos,
  lugares,
  organizaciones,
  preguntasFrecuentes,
  premios,
  qrRegistro,
  retos,
  sponsors,
  type Db,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { isPocosDisponibles } from '@pasitos/dominio/esquemas';
import { getCaminoReporte } from './reporte-publico';

/** Las secciones que el organizador puede hacer públicas (HU-206). El wifi nunca. */
type Seccion =
  | 'descripcion'
  | 'fecha'
  | 'lugar'
  | 'agenda'
  | 'sponsors'
  | 'preguntas'
  | 'retos'
  | 'catalogo'
  | 'contacto';

type EstadoPremio = 'agotado' | 'pocos' | 'disponible';
type EstadoPublico = 'proximo' | 'en_curso' | 'terminado';

const url = (id: string | null, variante: '1200' | '400'): string | null =>
  id ? `/api/v1/archivos/${id}/${variante}` : null;

/** Lo que tiene página pública: `real`, fuera de borrador y *Público* o *Solo con enlace*. */
const conPaginaPublica = (slug: string) =>
  and(
    eq(eventos.slug, slug),
    eq(eventos.tipo, 'real'),
    inArray(eventos.visibilidad, ['publico', 'solo_enlace']),
    sql`${eventos.estado} <> 'borrador'`,
  );

function toEstado(estado: string): EstadoPublico {
  if (estado === 'publicado') return 'proximo';
  if (estado === 'en_curso' || estado === 'pausado') return 'en_curso';
  return 'terminado';
}

function toEstadoPremio(total: number, disponible: number): EstadoPremio {
  if (disponible <= 0) return 'agotado';
  return isPocosDisponibles(disponible, total) ? 'pocos' : 'disponible';
}

/**
 * La página pública de un evento (HU-406 §1). Si no la tiene, `EVENTO_SIN_PAGINA_PUBLICA`, siempre
 * igual: no revela que el evento existe. Solo las secciones marcadas; nunca el wifi, el equipo, los
 * topes, los QR ni el stock exacto. Recibe la conexión de sistema (no hay organización).
 */
export async function getEventoPublico(sistema: Db, slug: string, llaveDatos: string) {
  const [evento] = await sistema
    .select({
      id: eventos.id,
      slug: eventos.slug,
      nombre: eventos.nombre,
      estado: eventos.estado,
      visibilidad: eventos.visibilidad,
      secciones: eventos.seccionesPublicas,
      descripcion: eventos.descripcion,
      contacto: eventos.contacto,
      inicioAt: eventos.inicioAt,
      finAt: eventos.finAt,
      zonaHoraria: eventos.zonaHoraria,
      lugarNombre: eventos.lugarNombre,
      lugarDireccion: eventos.lugarDireccion,
      lat: eventos.ubicacionLat,
      lng: eventos.ubicacionLng,
      mapaEstaticoArchivoId: eventos.mapaEstaticoArchivoId,
      logoArchivoId: eventos.logoArchivoId,
      portadaArchivoId: eventos.portadaArchivoId,
      registroPuertaActivo: eventos.registroPuertaActivo,
      autoregistroActivo: eventos.autoregistroActivo,
      organizacion: organizaciones.nombre,
    })
    .from(eventos)
    .innerJoin(organizaciones, eq(organizaciones.id, eventos.organizacionId))
    .where(conPaginaPublica(slug));
  if (!evento) throw new AppError('EVENTO_SIN_PAGINA_PUBLICA');
  const secciones = new Set<string>(evento.secciones);
  const con = (seccion: Seccion) => secciones.has(seccion);
  const id = evento.id;

  const agenda = con('agenda')
    ? await sistema
        .select({
          titulo: actividades.titulo,
          inicioAt: actividades.inicioAt,
          finAt: actividades.finAt,
          lugar: lugares.nombre,
          expositor: actividades.expositor,
        })
        .from(actividades)
        .leftJoin(lugares, eq(lugares.id, actividades.lugarId))
        .where(eq(actividades.eventoId, id))
        .orderBy(actividades.inicioAt, actividades.id)
    : [];
  const filasSponsors = con('sponsors')
    ? await sistema
        .select({
          nombre: sponsors.nombre,
          logoArchivoId: sponsors.logoArchivoId,
          descripcion: sponsors.descripcion,
          enlace: sponsors.enlace,
        })
        .from(sponsors)
        .where(eq(sponsors.eventoId, id))
        .orderBy(sponsors.orden, sponsors.id)
    : [];
  const preguntas = con('preguntas')
    ? await sistema
        .select({
          pregunta: preguntasFrecuentes.pregunta,
          respuesta: preguntasFrecuentes.respuesta,
        })
        .from(preguntasFrecuentes)
        .where(eq(preguntasFrecuentes.eventoId, id))
        .orderBy(preguntasFrecuentes.orden, preguntasFrecuentes.id)
    : [];
  // Los retos activos sin grupo, de más a menos puntos (sin los QR ni los topes).
  const filasRetos = con('retos')
    ? await sistema
        .select({ nombre: retos.nombre, descripcion: retos.descripcion, puntos: retos.puntos })
        .from(retos)
        .where(and(eq(retos.eventoId, id), eq(retos.estado, 'activo'), isNull(retos.grupoId)))
        .orderBy(desc(retos.puntos), retos.numero)
        .limit(6)
    : [];
  const filasPremios = con('catalogo')
    ? await sistema
        .select({
          nombre: premios.nombre,
          imagenArchivoId: premios.imagenArchivoId,
          puntos: premios.puntos,
          total: premios.stockTotal,
          reservado: premios.stockReservado,
          entregado: premios.stockEntregado,
        })
        .from(premios)
        .where(and(eq(premios.eventoId, id), eq(premios.estado, 'activo'), isNull(premios.grupoId)))
        .orderBy(premios.orden, premios.id)
    : [];
  const qrActivos = await sistema.$count(
    qrRegistro,
    and(eq(qrRegistro.eventoId, id), eq(qrRegistro.estado, 'activo')),
  );

  const estado = toEstado(evento.estado);
  // *Ver reporte* (HU-402): solo terminado y si el dueño lo comparte.
  const reporte = estado === 'terminado' ? await getCaminoReporte(sistema, id, llaveDatos) : null;

  return {
    slug: evento.slug,
    nombre: evento.nombre,
    organizacion: evento.organizacion,
    visibilidad: evento.visibilidad,
    estado,
    reporte,
    logo: url(evento.logoArchivoId, '400'),
    portada: url(evento.portadaArchivoId, '1200'),
    zonaHoraria: evento.zonaHoraria,
    comoEntrar: {
      registroPuerta: evento.registroPuertaActivo,
      qrRegistro: evento.autoregistroActivo && qrActivos > 0,
    },
    descripcion: con('descripcion') ? evento.descripcion : null,
    fecha: con('fecha')
      ? { inicioAt: evento.inicioAt.toISOString(), finAt: evento.finAt.toISOString() }
      : null,
    lugar:
      con('lugar') && (evento.lugarNombre || evento.lugarDireccion)
        ? {
            nombre: evento.lugarNombre,
            direccion: evento.lugarDireccion,
            mapa: url(evento.mapaEstaticoArchivoId, '1200'),
            enlaceMapa:
              evento.lat !== null && evento.lng !== null
                ? `https://www.google.com/maps/search/?api=1&query=${evento.lat},${evento.lng}`
                : null,
          }
        : null,
    agenda: agenda.map((a) => ({
      titulo: a.titulo,
      inicioAt: a.inicioAt.toISOString(),
      finAt: a.finAt.toISOString(),
      lugar: a.lugar,
      expositor: a.expositor,
    })),
    sponsors: filasSponsors.map((s) => ({
      nombre: s.nombre,
      logo: url(s.logoArchivoId, '400'),
      descripcion: s.descripcion,
      enlace: s.enlace,
    })),
    preguntas,
    retos: filasRetos,
    catalogo: filasPremios.map((p) => ({
      nombre: p.nombre,
      imagen: url(p.imagenArchivoId, '400'),
      puntos: p.puntos,
      estado: toEstadoPremio(p.total, p.total - p.reservado - p.entregado),
    })),
    contacto: con('contacto') ? evento.contacto : null,
  };
}

/** El id del evento, si tiene página pública (para *Ir a mi entrada*); si no, `null`. */
export async function getIdEventoPublico(sistema: Db, slug: string): Promise<string | null> {
  const [evento] = await sistema
    .select({ id: eventos.id })
    .from(eventos)
    .where(conPaginaPublica(slug));
  return evento?.id ?? null;
}
