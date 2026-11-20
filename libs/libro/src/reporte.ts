import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '@pasitos/db';
import {
  getFormaDeEntrar,
  roundTramo,
  UMBRAL_EVENTO_PEQUENO,
  UMBRAL_TRAMO,
  VERSION_REPORTE,
  type DatosReporte,
  type FormaDeEntrar,
  type StellarReporte,
  type TramoReporte,
} from '@pasitos/dominio';

/**
 * Los indicadores del reporte (HU-402 §3 y §3.1), con consultas de solo lectura. Sirve con la
 * transacción de la organización (RLS) o con la conexión de sistema. Solo totales: ni nombres de
 * asistentes, ni correos, ni códigos.
 *
 * Con `tramo`, lo que depende del tiempo se cuenta **dentro** del tramo (`desde` incluido, `hasta`
 * no); los presentes son los check-ins acumulados hasta el final del tramo.
 */

type Fila = Record<string, unknown>;

/** La transacción de la organización o la conexión de sistema: solo se lee. */
export type ConsultaReporte = Pick<Tx, 'execute'>;

async function filas<T extends Fila>(tx: ConsultaReporte, consulta: SQL): Promise<T[]> {
  const resultado = await tx.execute<T>(consulta);
  return resultado.rows as T[];
}

const n = (valor: unknown): number => Number(valor ?? 0);
const iso = (valor: unknown): string | null =>
  valor === null || valor === undefined ? null : new Date(valor as string).toISOString();

/** `and <columna> en el tramo`, o nada para el evento completo. */
function enTramo(columna: SQL, tramo: TramoReporte | null): SQL {
  return tramo
    ? sql`and ${columna} >= ${tramo.desde}::timestamptz and ${columna} < ${tramo.hasta}::timestamptz`
    : sql``;
}

/** `and <columna> antes del final del tramo`. */
function hastaTramo(columna: SQL, tramo: TramoReporte | null): SQL {
  return tramo ? sql`and ${columna} < ${tramo.hasta}::timestamptz` : sql``;
}

/** Un movimiento no anulado: nadie lo compensó con una `anulacion`. */
const noAnulado = sql`not exists (select 1 from movimientos x where x.anula_movimiento_id = m.id)`;

/** Movimientos que cuentan como actividad de una persona. */
const actividad = sql`m.tipo in ('checkin', 'reto', 'canje')`;

interface EventoBase {
  nombre: string;
  organizacion: string;
  tipo: string;
  zona_horaria: string;
  inicio_at: string;
  fin_at: string;
  cerrado_at: string | null;
  lugar_nombre: string | null;
  logo: string | null;
  nombre_puntos: string;
  primero: string | null;
  ultimo: string | null;
}

async function getEventoBase(tx: ConsultaReporte, eventoId: string): Promise<EventoBase | null> {
  const [fila] = await filas<EventoBase & Fila>(
    tx,
    sql`select e.nombre, o.nombre as organizacion, e.tipo, e.zona_horaria, e.inicio_at, e.fin_at,
               e.cerrado_at, e.lugar_nombre, e.nombre_puntos,
               case when e.logo_archivo_id is null then null
                    else '/api/v1/archivos/' || e.logo_archivo_id::text || '/400' end as logo,
               (select min(created_at) from movimientos where evento_id = e.id) as primero,
               (select max(created_at) from movimientos where evento_id = e.id) as ultimo
          from eventos e join organizaciones o on o.id = e.organizacion_id
         where e.id = ${eventoId}`,
  );
  return fila ?? null;
}

/** Del primer al último movimiento, sin salir del horario del evento hacia adentro. */
function getLimites(evento: EventoBase): TramoReporte {
  const inicio = Math.min(
    Date.parse(evento.inicio_at),
    evento.primero ? Date.parse(evento.primero) : Infinity,
  );
  const fin = Math.max(
    evento.cerrado_at ? Date.parse(evento.cerrado_at) : Date.parse(evento.fin_at),
    evento.ultimo ? Date.parse(evento.ultimo) + 1 : 0,
  );
  return {
    desde: roundTramo(new Date(inicio), 'abajo').toISOString(),
    hasta: roundTramo(new Date(fin), 'arriba').toISOString(),
  };
}

/** Los límites del evento para elegir un tramo (`null` si el evento no existe). */
export async function getLimitesReporte(
  tx: ConsultaReporte,
  eventoId: string,
): Promise<TramoReporte | null> {
  const evento = await getEventoBase(tx, eventoId);
  return evento ? getLimites(evento) : null;
}

async function countActivos(tx: ConsultaReporte, eventoId: string, desde: string, hasta: string) {
  const [fila] = await filas<{ total: number }>(
    tx,
    sql`select count(distinct m.asistente_id)::int as total from movimientos m
         where m.evento_id = ${eventoId} and ${actividad}
           and m.created_at >= ${desde}::timestamptz and m.created_at < ${hasta}::timestamptz`,
  );
  return n(fila?.total);
}

export async function buildDatosReporte(
  tx: ConsultaReporte,
  eventoId: string,
  tramo: TramoReporte | null = null,
  ahora: Date = new Date(),
): Promise<DatosReporte | null> {
  const evento = await getEventoBase(tx, eventoId);
  if (!evento) return null;
  const limites = getLimites(evento);

  // --- Asistencia ---
  const [invitacion] = await filas<{ invitados: number }>(
    tx,
    sql`select count(*)::int as invitados from asistentes
         where evento_id = ${eventoId} and estado <> 'cancelado' and origen in ('lista', 'csv')`,
  );
  const presentesPorForma = await filas<{ metodo: string; de_lista: boolean; total: number }>(
    tx,
    sql`select primero.metodo, a.origen in ('lista', 'csv') as de_lista, count(*)::int as total
          from (select distinct on (c.asistente_id) c.asistente_id, c.metodo
                  from check_ins c
                 where c.evento_id = ${eventoId} and c.anulado_at is null
                       ${hastaTramo(sql`c.created_at`, tramo)}
                 order by c.asistente_id, c.created_at) primero
          join asistentes a on a.id = primero.asistente_id
         group by primero.metodo, de_lista`,
  );
  const presentes = presentesPorForma.reduce((s, f) => s + n(f.total), 0);
  const presentesDeLista = presentesPorForma
    .filter((f) => f.de_lista)
    .reduce((s, f) => s + n(f.total), 0);
  const porFormaMapa = new Map<FormaDeEntrar, number>();
  for (const f of presentesPorForma) {
    const forma = getFormaDeEntrar(f.metodo);
    porFormaMapa.set(forma, (porFormaMapa.get(forma) ?? 0) + n(f.total));
  }
  // El evento es pequeño por sus presentes totales, no por los del tramo.
  const presentesEvento = tramo
    ? n(
        (
          await filas<{ total: number }>(
            tx,
            sql`select count(distinct asistente_id)::int as total from check_ins
                 where evento_id = ${eventoId} and anulado_at is null`,
          )
        )[0]?.total,
      )
    : presentes;
  const pequeno = presentesEvento < UMBRAL_EVENTO_PEQUENO;

  const [activosFila] = await filas<{ total: number }>(
    tx,
    sql`select count(distinct m.asistente_id)::int as total from movimientos m
         where m.evento_id = ${eventoId} and ${actividad} ${enTramo(sql`m.created_at`, tramo)}`,
  );
  const activos = n(activosFila?.total);
  const soloTotales = pequeno || (tramo !== null && activos < UMBRAL_TRAMO);

  let porRegistrador: DatosReporte['asistencia']['porRegistrador'] = null;
  let franjas: DatosReporte['asistencia']['franjas'] = null;
  let retencion: DatosReporte['asistencia']['retencion'] = null;
  if (!soloTotales) {
    const registros = await filas<{ nombre: string | null; total: number }>(
      tx,
      sql`select u.nombre, count(*)::int as total
            from check_ins c left join usuarios u on u.id = c.registrador_id
           where c.evento_id = ${eventoId} and c.anulado_at is null and c.metodo = 'registro_puerta'
                 ${enTramo(sql`c.created_at`, tramo)}
           group by u.nombre order by total desc, u.nombre`,
    );
    porRegistrador = registros.map((r) => ({
      nombre: r.nombre ?? 'Sin nombre',
      total: n(r.total),
    }));

    const zona = evento.zona_horaria;
    const horas = await filas<{ hora: string; check_ins: number; activos: number }>(
      tx,
      sql`select (date_trunc('hour', m.created_at at time zone ${zona}) at time zone ${zona}) as hora,
                 count(*) filter (where m.tipo = 'checkin' and ${noAnulado})::int as check_ins,
                 count(distinct m.asistente_id)::int as activos
            from movimientos m
           where m.evento_id = ${eventoId} and ${actividad} ${enTramo(sql`m.created_at`, tramo)}
           group by 1 order by 1`,
    );
    franjas = horas.map((h) => ({
      hora: iso(h.hora) ?? '',
      checkIns: n(h.check_ins),
      activos: n(h.activos),
    }));

    // Retención (ajuste 10): la primera y la última hora del evento (o del tramo).
    const inicio = Date.parse(tramo?.desde ?? evento.inicio_at);
    const fin = Date.parse(tramo?.hasta ?? evento.fin_at);
    const hora = 3_600_000;
    const primeraHora = await countActivos(
      tx,
      eventoId,
      new Date(inicio).toISOString(),
      new Date(Math.min(inicio + hora, fin)).toISOString(),
    );
    const ultimaHora = await countActivos(
      tx,
      eventoId,
      new Date(Math.max(fin - hora, inicio)).toISOString(),
      new Date(fin).toISOString(),
    );
    const extremos = await filas<{ titulo: string; reto_id: string | null; participantes: number }>(
      tx,
      sql`select x.titulo, x.reto_id,
                 (select count(distinct m.asistente_id)::int from movimientos m
                   where m.reto_id = x.reto_id and m.tipo = 'reto' and ${noAnulado}
                         ${enTramo(sql`m.created_at`, tramo)}) as participantes
            from (
              (select titulo, reto_id from actividades where evento_id = ${eventoId}
                      ${enTramo(sql`inicio_at`, tramo)} order by inicio_at asc limit 1)
              union all
              (select titulo, reto_id from actividades where evento_id = ${eventoId}
                      ${enTramo(sql`inicio_at`, tramo)} order by inicio_at desc limit 1)
            ) x`,
    );
    // Apertura frente a cierre: solo si la primera y la última actividad tienen reto.
    const [apertura, cierre] = extremos;
    const conReto = Boolean(apertura?.reto_id && cierre?.reto_id && apertura !== cierre);
    retencion = {
      primeraHora,
      ultimaHora,
      apertura:
        conReto && apertura
          ? { titulo: apertura.titulo, participantes: n(apertura.participantes) }
          : null,
      cierre:
        conReto && cierre
          ? { titulo: cierre.titulo, participantes: n(cierre.participantes) }
          : null,
    };
  }

  // --- Participación ---
  const retos = await filas<{
    numero: number;
    nombre: string;
    tipo: string;
    tope: number;
    lugar: string | null;
    sponsor: string | null;
    participaciones: number;
  }>(
    tx,
    sql`select r.numero, r.nombre, r.tipo, r.tope_total as tope, l.nombre as lugar,
               s.nombre as sponsor,
               (select count(*)::int from movimientos m
                 where m.evento_id = ${eventoId} and m.reto_id = r.id and m.tipo = 'reto'
                       and ${noAnulado} ${enTramo(sql`m.created_at`, tramo)}) as participaciones
          from retos r
          left join lugares l on l.id = r.lugar_id
          left join sponsors s on s.id = r.sponsor_id
         where r.evento_id = ${eventoId}
         order by participaciones desc, r.numero`,
  );
  const porReto = retos.map((r) => ({
    numero: n(r.numero),
    nombre: r.nombre,
    tipo: r.tipo,
    participaciones: n(r.participaciones),
    tope: n(r.tope),
    lugar: r.lugar,
    sponsor: r.sponsor,
  }));
  const sumarPor = (clave: 'lugar' | 'sponsor') => {
    const mapa = new Map<string, number>();
    for (const r of porReto) {
      const nombre = r[clave];
      if (nombre) mapa.set(nombre, (mapa.get(nombre) ?? 0) + r.participaciones);
    }
    return [...mapa]
      .map(([nombre, participaciones]) => ({ nombre, participaciones }))
      .sort((a, b) => b.participaciones - a.participaciones || a.nombre.localeCompare(b.nombre));
  };

  const [personas] = await filas<{ con_reto: number; con_canje: number }>(
    tx,
    sql`select
          (select count(distinct m.asistente_id)::int from movimientos m
            where m.evento_id = ${eventoId} and m.tipo = 'reto' and ${noAnulado}
                  ${enTramo(sql`m.created_at`, tramo)}) as con_reto,
          (select count(distinct c.asistente_id)::int from canjes c
            where c.evento_id = ${eventoId} and c.estado = 'confirmado'
                  ${enTramo(sql`c.created_at`, tramo)}) as con_canje`,
  );

  const [fotos] = await filas<{
    enviadas: number;
    aprobadas: number;
    rechazadas: number;
    con_autorizacion: number;
  }>(
    tx,
    sql`select count(*)::int as enviadas,
               count(*) filter (where estado = 'aprobada')::int as aprobadas,
               count(*) filter (where estado in ('rechazada', 'rechazada_sistema'))::int as rechazadas,
               count(*) filter (where estado = 'aprobada' and autoriza_uso
                                  and autoriza_uso_retirada_at is null)::int as con_autorizacion
          from envios_foto where evento_id = ${eventoId} ${enTramo(sql`created_at`, tramo)}`,
  );

  let porGrupo: DatosReporte['participacion']['porGrupo'] = null;
  if (!soloTotales) {
    const grupos = await filas<{ nombre: string; presentes: number; participaciones: number }>(
      tx,
      sql`select g.nombre,
                 (select count(distinct c.asistente_id)::int
                    from check_ins c join asistente_grupos ag on ag.asistente_id = c.asistente_id
                   where ag.grupo_id = g.id and c.evento_id = ${eventoId} and c.anulado_at is null
                         ${hastaTramo(sql`c.created_at`, tramo)}) as presentes,
                 (select count(*)::int
                    from movimientos m join asistente_grupos ag on ag.asistente_id = m.asistente_id
                   where ag.grupo_id = g.id and m.evento_id = ${eventoId} and m.tipo = 'reto'
                         and ${noAnulado} ${enTramo(sql`m.created_at`, tramo)}) as participaciones
            from grupos g where g.evento_id = ${eventoId} order by g.nombre`,
    );
    porGrupo = grupos.map((g) => ({
      nombre: g.nombre,
      presentes: n(g.presentes),
      participaciones: n(g.participaciones),
    }));
  }

  // --- Puntos (coinciden con los `totales` del contrato en el evento completo) ---
  const [puntos] = await filas<{
    ganados: number;
    canjeados: number;
    ajustados: number;
    vencidos: number;
    anulaciones: number;
  }>(
    tx,
    sql`select coalesce(sum(puntos) filter (where tipo in ('checkin', 'reto')), 0)::int as ganados,
               coalesce(-sum(puntos) filter (where tipo = 'canje'), 0)::int as canjeados,
               coalesce(sum(puntos) filter (where tipo in ('ajuste', 'anulacion')), 0)::int as ajustados,
               count(*) filter (where tipo = 'anulacion')::int as anulaciones
          from movimientos where evento_id = ${eventoId} ${enTramo(sql`created_at`, tramo)}`,
  );
  // Los vencimientos pasan al cierre: no dependen del tramo.
  const [vencidos] = await filas<{ total: number }>(
    tx,
    sql`select coalesce(-sum(puntos), 0)::int as total from movimientos
         where evento_id = ${eventoId} and tipo = 'vencimiento'`,
  );
  const ajustes = await filas<{ categoria: string | null; total: number }>(
    tx,
    sql`select motivo as categoria, count(*)::int as total from movimientos
         where evento_id = ${eventoId} and tipo = 'ajuste' ${enTramo(sql`created_at`, tramo)}
         group by motivo order by total desc, motivo`,
  );

  // --- Premios ---
  const premios = await filas<{
    nombre: string;
    entregados: number;
    anulados: number;
    sobrante: number;
  }>(
    tx,
    sql`select p.nombre,
               coalesce(sum(i.cantidad) filter (where c.estado = 'confirmado'), 0)::int as entregados,
               coalesce(sum(i.cantidad) filter (where c.estado = 'anulado'), 0)::int as anulados,
               greatest(p.stock_total - p.stock_entregado, 0)::int as sobrante
          from premios p
          left join canje_items i on i.premio_id = p.id
          left join canjes c on c.id = i.canje_id ${enTramo(sql`c.created_at`, tramo)}
         where p.evento_id = ${eventoId}
         group by p.id, p.nombre, p.stock_total, p.stock_entregado, p.orden
         order by entregados desc, p.orden, p.nombre`,
  );
  const [canjesFila] = await filas<{ canjes: number; gratuitos: number }>(
    tx,
    sql`select count(*)::int as canjes, count(*) filter (where total_puntos = 0)::int as gratuitos
          from canjes where evento_id = ${eventoId} and estado = 'confirmado'
                ${enTramo(sql`created_at`, tramo)}`,
  );
  const porPremio = premios.map((p) => ({
    nombre: p.nombre,
    entregados: n(p.entregados),
    anulados: n(p.anulados),
    sobrante: n(p.sobrante),
  }));

  const agenda = await filas<{ titulo: string; inicio_at: string; fin_at: string }>(
    tx,
    sql`select titulo, inicio_at, fin_at from actividades
         where evento_id = ${eventoId} order by inicio_at, titulo`,
  );

  return {
    version: VERSION_REPORTE,
    generadoAt: ahora.toISOString(),
    evento: {
      nombre: evento.nombre,
      organizacion: evento.organizacion,
      tipo: evento.tipo,
      zonaHoraria: evento.zona_horaria,
      inicioAt: iso(evento.inicio_at) ?? '',
      finAt: iso(evento.fin_at) ?? '',
      cerradoAt: iso(evento.cerrado_at),
      lugar: evento.lugar_nombre,
      logo: evento.logo,
      nombrePuntos: evento.nombre_puntos,
      agenda: agenda.map((x) => ({
        titulo: x.titulo,
        inicioAt: iso(x.inicio_at) ?? '',
        finAt: iso(x.fin_at) ?? '',
      })),
    },
    limites,
    tramo,
    pequeno,
    soloTotales,
    asistencia: {
      invitados: n(invitacion?.invitados),
      presentes,
      presentesDeLista,
      tasa: n(invitacion?.invitados) > 0 ? presentesDeLista / n(invitacion?.invitados) : null,
      activos,
      porForma: soloTotales
        ? []
        : [...porFormaMapa]
            .map(([forma, total]) => ({ forma, total }))
            .sort((a, b) => b.total - a.total),
      porRegistrador,
      franjas,
      retencion,
    },
    participacion: {
      participaciones: porReto.reduce((s, r) => s + r.participaciones, 0),
      conReto: n(personas?.con_reto),
      conCanje: n(personas?.con_canje),
      porReto,
      porLugar: sumarPor('lugar'),
      porSponsor: sumarPor('sponsor'),
      fotos: {
        enviadas: n(fotos?.enviadas),
        aprobadas: n(fotos?.aprobadas),
        rechazadas: n(fotos?.rechazadas),
        conAutorizacion: n(fotos?.con_autorizacion),
      },
      porGrupo,
    },
    puntos: {
      ganados: n(puntos?.ganados),
      canjeados: n(puntos?.canjeados),
      ajustados: n(puntos?.ajustados),
      vencidos: n(vencidos?.total),
      ajustes: ajustes.map((a) => ({ categoria: a.categoria ?? 'Otro', total: n(a.total) })),
      anulaciones: n(puntos?.anulaciones),
    },
    premios: {
      entregados: porPremio.reduce((s, p) => s + p.entregados, 0),
      canjes: n(canjesFila?.canjes),
      gratuitos: n(canjesFila?.gratuitos),
      porPremio,
    },
  };
}

const EXPLORADOR = 'https://stellar.expert/explorer/testnet';

/** La tarjeta de Stellar del reporte: el contrato, los lotes anclados y el cierre. */
export async function getStellarReporte(
  tx: ConsultaReporte,
  eventoId: string,
  red: 'local' | 'testnet',
): Promise<StellarReporte> {
  const [evento] = await filas<{
    contrato_id: string | null;
    cierre_estado: string | null;
    cerrado_at: string | null;
    en_red_hasta: string | null;
    evidencia_sha256: string | null;
  }>(
    tx,
    sql`select contrato_id, cierre_estado, cerrado_at, en_red_hasta, evidencia_sha256
          from eventos where id = ${eventoId}`,
  );
  const lotes = await filas<{
    numero: number;
    tx_hash: string | null;
    confirmado_at: string | null;
    huella: string;
  }>(
    tx,
    sql`select numero, tx_hash, confirmado_at, encode(huella, 'hex') as huella
          from lotes where evento_id = ${eventoId} and estado = 'confirmado' order by numero`,
  );
  const enlace = (camino: string) => (red === 'testnet' ? `${EXPLORADOR}/${camino}` : null);
  const contratoId = evento?.contrato_id ?? null;
  return {
    red,
    contratoId,
    enlaceContrato: contratoId ? enlace(`contract/${contratoId}`) : null,
    estado: evento?.cierre_estado === 'listo' ? 'registrado' : 'pendiente',
    lotes: lotes.map((l) => ({
      numero: n(l.numero),
      txHash: l.tx_hash,
      enlace: l.tx_hash ? enlace(`tx/${l.tx_hash}`) : null,
      confirmadoAt: iso(l.confirmado_at),
    })),
    huellaFinal: lotes.at(-1)?.huella ?? null,
    cerradoAt: iso(evento?.cerrado_at),
    enRedHasta: iso(evento?.en_red_hasta),
    evidenciaSha256: evento?.evidencia_sha256 ?? null,
  };
}
