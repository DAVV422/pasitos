/**
 * Cupo diario de correos (D57, T-007 §3): como mucho `topeDiario` por día, de los cuales
 * `reservaSeguridad` solo los puede usar la prioridad 1. El día se cuenta en hora de Bolivia.
 * Funciones puras: las usan el envío (trabajador) y la estimación de entrega (API).
 */

/** Bolivia no tiene horario de verano: UTC−4 todo el año. */
const DESFASE_BOLIVIA_MS = -4 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface OpcionesCupo {
  readonly topeDiario: number;
  readonly reservaSeguridad: number;
}

export const CUPO_POR_DEFECTO: OpcionesCupo = { topeDiario: 80, reservaSeguridad: 10 };

export interface EnviadosHoy {
  readonly total: number;
  readonly seguridad: number;
}

export interface CupoHoy {
  /** Lo que pueden usar hoy los de prioridad 1. */
  readonly seguridad: number;
  /** Lo que pueden usar hoy los demás (prioridades 2 a 4). */
  readonly resto: number;
}

/** 00:00 de hoy en Bolivia, como instante. */
export function getInicioDia(fecha: Date): Date {
  const local = fecha.getTime() + DESFASE_BOLIVIA_MS;
  return new Date(local - (((local % DIA_MS) + DIA_MS) % DIA_MS) - DESFASE_BOLIVIA_MS);
}

export function addDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * DIA_MS);
}

export function getCupoHoy(opciones: OpcionesCupo, enviados: EnviadosHoy): CupoHoy {
  const libre = Math.max(0, opciones.topeDiario - enviados.total);
  const otrosEnviados = enviados.total - enviados.seguridad;
  return {
    seguridad: libre,
    resto: Math.max(
      0,
      Math.min(libre, opciones.topeDiario - opciones.reservaSeguridad - otrosEnviados),
    ),
  };
}

/**
 * En qué día sale (0 = hoy) el correo en la posición `posicion` (0 = el primero) de su fila. La
 * prioridad 1 tiene su propia fila; las demás comparten una, ordenada por prioridad y antigüedad.
 */
export function getDiaDeSalida(
  posicion: number,
  esSeguridad: boolean,
  cupoHoy: CupoHoy,
  opciones: OpcionesCupo,
): number {
  const hoy = esSeguridad ? cupoHoy.seguridad : cupoHoy.resto;
  const porDia = esSeguridad
    ? opciones.topeDiario
    : opciones.topeDiario - opciones.reservaSeguridad;
  if (posicion < hoy) {
    return 0;
  }
  return porDia <= 0 ? Number.POSITIVE_INFINITY : 1 + Math.floor((posicion - hoy) / porDia);
}

/** `programado_para`: ahora si sale hoy; si no, las 00:00 del día en que sale. */
export function getProgramadoPara(dia: number, ahora: Date): Date {
  return dia === 0 ? ahora : addDias(getInicioDia(ahora), dia);
}
