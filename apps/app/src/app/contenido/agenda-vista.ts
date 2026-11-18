import type { ActividadApp } from '../asistente-api.service';

/** Una actividad de la agenda como se ve (HU-309 §2): si es *ahora* y los puntos de su reto. */
export interface ActividadVista extends ActividadApp {
  readonly ahora: boolean;
  readonly terminada: boolean;
  readonly puntos: number | null;
}

export interface DiaAgenda {
  /** `AAAA-MM-DD` en la zona del evento. */
  readonly clave: string;
  readonly actividades: readonly ActividadVista[];
}

const CLAVE_DIA = new Map<string, Intl.DateTimeFormat>();

/** El día de una fecha en la zona del evento (no en la del celular). */
export function getClaveDia(fecha: string, zona: string): string {
  let formato = CLAVE_DIA.get(zona);
  if (!formato) {
    formato = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: zona,
    });
    CLAVE_DIA.set(zona, formato);
  }
  return formato.format(new Date(fecha));
}

/**
 * La agenda por día, en orden, con *Ahora* marcado. `puntosPorReto` trae solo los retos que la
 * persona ve (HU-325): una charla con un reto de otro grupo no muestra puntos.
 */
export function groupAgenda(
  agenda: readonly ActividadApp[],
  opciones: {
    readonly zona: string;
    readonly ahora: number;
    readonly puntosPorReto: ReadonlyMap<string, number>;
    readonly lugar?: string | null;
  },
): DiaAgenda[] {
  const dias = new Map<string, ActividadVista[]>();
  const ordenada = [...agenda]
    .filter((a) => !opciones.lugar || a.lugar === opciones.lugar)
    .sort((a, b) => Date.parse(a.inicioAt) - Date.parse(b.inicioAt) || a.id.localeCompare(b.id));
  for (const actividad of ordenada) {
    const inicio = Date.parse(actividad.inicioAt);
    const fin = Date.parse(actividad.finAt);
    const clave = getClaveDia(actividad.inicioAt, opciones.zona);
    const lista = dias.get(clave) ?? [];
    lista.push({
      ...actividad,
      ahora: inicio <= opciones.ahora && fin > opciones.ahora,
      terminada: fin <= opciones.ahora,
      puntos: actividad.retoId ? (opciones.puntosPorReto.get(actividad.retoId) ?? null) : null,
    });
    dias.set(clave, lista);
  }
  return [...dias].map(([clave, actividades]) => ({ clave, actividades }));
}

/** Los lugares que aparecen en la agenda, para el filtro. */
export function getLugaresAgenda(agenda: readonly ActividadApp[]): string[] {
  return [...new Set(agenda.flatMap((a) => (a.lugar ? [a.lugar] : [])))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}
