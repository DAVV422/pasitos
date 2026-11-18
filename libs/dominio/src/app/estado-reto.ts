/**
 * El estado de cada reto **para una persona** (HU-308 §1): lo que muestra *Inicio* y *Retos*.
 * Puro: lo usa `GET /app/estado`. Los estados de los retos de foto (`en_revision`, `rechazada`)
 * llegan con HU-322.
 */
export type EstadoRetoAsistente = 'disponible' | 'completado' | 'desde' | 'agotado' | 'desactivado';

export interface RetoParaEstado {
  readonly estado: string;
  readonly topeTotal: number;
  readonly entregados: number;
  readonly vecesPorPersona: number;
  readonly disponibleDesde: Date | null;
  readonly disponibleHasta: Date | null;
}

export interface ParticipacionDeLaPersona {
  readonly completadas: number;
  readonly ultimaAt: Date | null;
}

export interface EstadoRetoCalculado {
  readonly estado: EstadoRetoAsistente;
  readonly completadas: number;
  /** En `desde`: desde cuándo se puede (la hora del reto o el inicio del evento). */
  readonly desde: Date | null;
  readonly completadoAt: Date | null;
}

/**
 * Por orden: lo que ya completó, lo apagado o vencido, lo que falta para empezar, lo agotado y,
 * si no, disponible. Antes de que el evento empiece, todo dice *"Desde las HH:MM"*.
 */
export function getEstadoReto(
  reto: RetoParaEstado,
  persona: ParticipacionDeLaPersona,
  evento: { readonly estado: string; readonly inicioAt: Date },
  ahora: Date,
): EstadoRetoCalculado {
  const base = { completadas: persona.completadas, desde: null, completadoAt: null };
  if (persona.completadas >= reto.vecesPorPersona) {
    return { ...base, estado: 'completado', completadoAt: persona.ultimaAt };
  }
  if (reto.estado !== 'activo' || (reto.disponibleHasta && reto.disponibleHasta <= ahora)) {
    return { ...base, estado: 'desactivado' };
  }
  const desde =
    evento.estado === 'publicado'
      ? maxFecha(reto.disponibleDesde, evento.inicioAt)
      : reto.disponibleDesde && reto.disponibleDesde > ahora
        ? reto.disponibleDesde
        : null;
  if (desde) {
    return { ...base, estado: 'desde', desde };
  }
  if (reto.entregados >= reto.topeTotal) {
    return { ...base, estado: 'agotado' };
  }
  return { ...base, estado: 'disponible' };
}

function maxFecha(a: Date | null, b: Date): Date {
  return a && a > b ? a : b;
}
