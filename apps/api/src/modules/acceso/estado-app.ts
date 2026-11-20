import { createHash } from 'node:crypto';
import { and, count, desc, eq, max, sql } from 'drizzle-orm';
import {
  enviosFoto,
  asistentes,
  eventos,
  lotes,
  movimientos,
  movimientosLote,
  participaciones,
  premios,
  retos,
  saldos,
  type Tx,
} from '@pasitos/db';
import {
  getIntentosRestantes,
  AppError,
  getEstadoReto,
  type EstadoRetoAsistente,
} from '@pasitos/dominio';
import { isPocosDisponibles } from '@pasitos/dominio/esquemas';
import { listGruposDe, whereParaLaPersona } from '../grupos/grupos-de';

/**
 * Lo que la app pide al abrir (`GET /app/estado`, HU-308 §1, API §5.2): una sola llamada de 2 a
 * 4 KB con lo que cambia. La definición de los retos y los premios (nombre, imagen, precio) viene
 * de `GET /app/evento`.
 */
export interface EstadoApp {
  readonly asistente: {
    readonly codigo: string;
    readonly nombre: string;
    readonly estado: string;
    /** HU-325. */
    readonly grupos: readonly string[];
    /** HU-320 y HU-321. */
    readonly ci: { readonly cargado: boolean; readonly verificado: boolean };
  };
  readonly saldo: number;
  /** HU-401: lo que venció al cierre (*"Tus 120 pasos vencieron al cierre"*). */
  readonly vencidos: number;
  readonly evento: {
    readonly id: string;
    readonly nombre: string;
    readonly estado: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly nombrePuntos: string;
    readonly requiereCheckIn: boolean;
    readonly zonaHoraria: string;
    /** HU-401: el cierre programado, para el aviso *"Los puntos vencen a las 19:00"*. */
    readonly cierreProgramadoAt: string | null;
  };
  readonly retos: readonly EstadoRetoApp[];
  readonly premios: readonly StockPremioApp[];
  readonly ultimosMovimientos: readonly MovimientoApp[];
}

export interface EstadoRetoApp {
  readonly id: string;
  readonly estado: EstadoRetoAsistente;
  readonly completadas: number;
  readonly desde: string | null;
  readonly completadoAt: string | null;
  /** HU-322: la última foto de la persona en un reto con foto, y los intentos que le quedan. */
  readonly foto?: {
    readonly estado: string;
    readonly motivo: string | null;
    readonly intentosRestantes: number;
  } | null;
}

export interface StockPremioApp {
  readonly id: string;
  readonly disponible: number;
  readonly pocos: boolean;
}

export interface MovimientoApp {
  readonly id: string;
  readonly tipo: string;
  readonly puntos: number;
  readonly detalle: string;
  readonly hora: string;
  readonly enStellar: boolean;
}

const ULTIMOS = 5;

/** Lo que dice cada movimiento en la app, sin el motivo interno del equipo. */
export function getDetalleMovimiento(tipo: string, reto: string | null): string {
  switch (tipo) {
    case 'reto':
      return reto ?? 'Reto';
    case 'checkin':
      return 'Bienvenida';
    case 'canje':
      return 'Canje';
    case 'anulacion':
      return 'Anulación';
    case 'ajuste':
      return 'Ajuste del organizador';
    case 'vencimiento':
      return 'Vencimiento de los puntos';
    default:
      return 'Movimiento';
  }
}

export async function getEstadoApp(
  tx: Tx,
  asistenteId: string,
  ahora: Date = new Date(),
): Promise<EstadoApp> {
  const [fila] = await tx
    .select({
      codigo: asistentes.codigoAsistente,
      nombre: asistentes.nombre,
      estado: asistentes.estado,
      saldo: saldos.puntos,
      eventoId: eventos.id,
      evento: eventos.nombre,
      eventoEstado: eventos.estado,
      inicioAt: eventos.inicioAt,
      finAt: eventos.finAt,
      nombrePuntos: eventos.nombrePuntos,
      requiereCheckIn: eventos.retosRequierenCheckIn,
      zonaHoraria: eventos.zonaHoraria,
      cierreProgramadoAt: eventos.cierreProgramadoAt,
      vencidos: sql<number>`(select coalesce(-sum(${movimientos.puntos}), 0)::int from ${movimientos}
        where ${movimientos.asistenteId} = ${asistentes.id} and ${movimientos.tipo} = 'vencimiento')`,
      ciCargado: sql<boolean>`${asistentes.ciCifrado} is not null`,
      ciVerificado: sql<boolean>`${asistentes.ciVerificadoAt} is not null`,
    })
    .from(asistentes)
    .innerJoin(eventos, eq(eventos.id, asistentes.eventoId))
    .leftJoin(saldos, eq(saldos.asistenteId, asistentes.id))
    .where(eq(asistentes.id, asistenteId));
  if (!fila) {
    throw new AppError('NO_ENCONTRADO');
  }

  // HU-325: solo los retos y premios sin grupo o de un grupo de la persona.
  const gruposDeLaPersona = await listGruposDe(tx, asistenteId);
  const grupoIds = gruposDeLaPersona.map((g) => g.id);

  // Un bloque por consulta (HU-308 §1): retos con lo que hizo la persona, stock y movimientos.
  const deLaPersona = tx
    .select({
      retoId: participaciones.retoId,
      completadas: count().as('completadas'),
      ultimaAt: max(participaciones.createdAt).as('ultima_at'),
    })
    .from(participaciones)
    .where(eq(participaciones.asistenteId, asistenteId))
    .groupBy(participaciones.retoId)
    .as('de_la_persona');
  const [filasRetos, filasPremios, filasMovimientos] = await Promise.all([
    tx
      .select({
        id: retos.id,
        estado: retos.estado,
        topeTotal: retos.topeTotal,
        entregados: retos.entregados,
        vecesPorPersona: retos.vecesPorPersona,
        tipo: retos.tipo,
        intentosMax: retos.intentosMax,
        disponibleDesde: retos.disponibleDesde,
        disponibleHasta: retos.disponibleHasta,
        completadas: deLaPersona.completadas,
        ultimaAt: deLaPersona.ultimaAt,
      })
      .from(retos)
      .leftJoin(deLaPersona, eq(deLaPersona.retoId, retos.id))
      .where(and(eq(retos.eventoId, fila.eventoId), whereParaLaPersona(retos.grupoId, grupoIds)))
      .orderBy(retos.numero),
    tx
      .select({
        id: premios.id,
        total: premios.stockTotal,
        reservado: premios.stockReservado,
        entregado: premios.stockEntregado,
      })
      .from(premios)
      .where(
        and(
          eq(premios.eventoId, fila.eventoId),
          eq(premios.estado, 'activo'),
          whereParaLaPersona(premios.grupoId, grupoIds),
        ),
      )
      .orderBy(premios.orden, premios.id),
    tx
      .select({
        id: movimientos.id,
        tipo: movimientos.tipo,
        puntos: movimientos.puntos,
        reto: retos.nombre,
        hora: movimientos.createdAt,
        enStellar: sql<boolean>`coalesce(${lotes.estado} = 'confirmado', false)`,
      })
      .from(movimientos)
      .leftJoin(retos, eq(retos.id, movimientos.retoId))
      .leftJoin(movimientosLote, eq(movimientosLote.movimientoId, movimientos.id))
      .leftJoin(lotes, eq(lotes.id, movimientosLote.loteId))
      .where(eq(movimientos.asistenteId, asistenteId))
      .orderBy(desc(movimientos.id))
      .limit(ULTIMOS),
  ]);

  // HU-322: las fotos de la persona, la última de cada reto y los rechazos que gastan intentos.
  const fotos = await tx
    .select({
      retoId: enviosFoto.retoId,
      estado: enviosFoto.estado,
      motivo: enviosFoto.motivoRechazo,
      intento: enviosFoto.intento,
    })
    .from(enviosFoto)
    .where(eq(enviosFoto.asistenteId, asistenteId))
    .orderBy(desc(enviosFoto.intento));
  const ultimaFoto = new Map<string, (typeof fotos)[number]>();
  const rechazos = new Map<string, number>();
  for (const f of fotos) {
    if (!ultimaFoto.has(f.retoId)) ultimaFoto.set(f.retoId, f);
    if (f.estado === 'rechazada') rechazos.set(f.retoId, (rechazos.get(f.retoId) ?? 0) + 1);
  }

  const evento = { estado: fila.eventoEstado, inicioAt: fila.inicioAt };
  return {
    asistente: {
      codigo: fila.codigo,
      nombre: fila.nombre,
      estado: fila.estado,
      grupos: gruposDeLaPersona.map((g) => g.nombre),
      ci: { cargado: fila.ciCargado, verificado: fila.ciVerificado },
    },
    saldo: fila.saldo ?? 0,
    vencidos: Number(fila.vencidos ?? 0),
    evento: {
      id: fila.eventoId,
      nombre: fila.evento,
      estado: fila.eventoEstado,
      inicioAt: fila.inicioAt.toISOString(),
      finAt: fila.finAt.toISOString(),
      nombrePuntos: fila.nombrePuntos,
      requiereCheckIn: fila.requiereCheckIn,
      zonaHoraria: fila.zonaHoraria,
      cierreProgramadoAt: fila.cierreProgramadoAt?.toISOString() ?? null,
    },
    retos: filasRetos.map((reto) => {
      const calculado = getEstadoReto(
        reto,
        { completadas: Number(reto.completadas ?? 0), ultimaAt: toFecha(reto.ultimaAt) },
        evento,
        ahora,
      );
      return {
        id: reto.id,
        estado: calculado.estado,
        completadas: calculado.completadas,
        desde: calculado.desde?.toISOString() ?? null,
        completadoAt: calculado.completadoAt?.toISOString() ?? null,
        ...(reto.tipo === 'foto'
          ? {
              foto: ultimaFoto.has(reto.id)
                ? {
                    estado: ultimaFoto.get(reto.id)?.estado ?? 'recibida',
                    motivo: ultimaFoto.get(reto.id)?.motivo ?? null,
                    intentosRestantes: getIntentosRestantes(
                      reto.intentosMax,
                      rechazos.get(reto.id) ?? 0,
                    ),
                  }
                : null,
            }
          : {}),
      };
    }),
    premios: filasPremios.map((premio) => {
      const disponible = Math.max(0, premio.total - premio.reservado - premio.entregado);
      return {
        id: premio.id,
        disponible,
        pocos: disponible > 0 && isPocosDisponibles(disponible, premio.total),
      };
    }),
    ultimosMovimientos: filasMovimientos.map((movimiento) => ({
      id: movimiento.id,
      tipo: movimiento.tipo,
      puntos: movimiento.puntos,
      detalle: getDetalleMovimiento(movimiento.tipo, movimiento.reto),
      hora: movimiento.hora.toISOString(),
      enStellar: movimiento.enStellar,
    })),
  };
}

/** El `max()` de una subconsulta llega como texto: se vuelve fecha. */
function toFecha(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor : new Date(valor);
}

/** `ETag` del contenido (HU-308 §1): si no cambió, `304`. */
export function getEtag(contenido: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(contenido)).digest('base64url');
  return `"${hash.slice(0, 22)}"`;
}
