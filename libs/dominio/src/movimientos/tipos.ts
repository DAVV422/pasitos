/**
 * Libro de movimientos (D22, HU-101).
 * Fuente: docs/version-piloto/04-modelo-de-datos.md §6.
 */
export const TIPOS_MOVIMIENTO = [
  'checkin',
  'reto',
  'canje',
  'anulacion',
  'ajuste',
  'vencimiento',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ORIGENES_MOVIMIENTO = ['asistente', 'equipo', 'sistema'] as const;
export type OrigenMovimiento = (typeof ORIGENES_MOVIMIENTO)[number];

/** Estados del asistente (Modelo de datos §11.2). */
export const ESTADOS_ASISTENTE = ['invitado', 'registrado', 'presente', 'cancelado'] as const;
export type EstadoAsistente = (typeof ESTADOS_ASISTENTE)[number];

export const TIPOS_RETO = ['qr', 'otorgado', 'encuesta'] as const;
export type TipoReto = (typeof TIPOS_RETO)[number];

export const ESTADOS_RETO = ['activo', 'desactivado'] as const;
export type EstadoReto = (typeof ESTADOS_RETO)[number];

/** Estados de un lote (Contrato y sellador §3). */
export const ESTADOS_LOTE = ['armado', 'enviado', 'confirmado', 'rechazado'] as const;
export type EstadoLote = (typeof ESTADOS_LOTE)[number];

/** Tipos que suman a lo "ganado" por una persona (tope de puntos por persona). */
export const TIPOS_GANANCIA = ['checkin', 'reto'] as const satisfies readonly TipoMovimiento[];

export function isTipoGanancia(tipo: TipoMovimiento): boolean {
  return (TIPOS_GANANCIA as readonly TipoMovimiento[]).includes(tipo);
}

/**
 * Signo que exige cada tipo (también lo exige un CHECK en la base).
 * `checkin` admite 0 porque los puntos de bienvenida son 0 por defecto (D46).
 */
export function isSignoValido(tipo: TipoMovimiento, puntos: number): boolean {
  if (!Number.isSafeInteger(puntos)) {
    return false;
  }
  switch (tipo) {
    case 'checkin':
      return puntos >= 0;
    case 'reto':
      return puntos > 0;
    case 'canje':
    case 'vencimiento':
      return puntos < 0;
    case 'anulacion':
    case 'ajuste':
      return puntos !== 0;
  }
}
