import type { CodigoError } from '../errores/catalogo';
import { isTipoGanancia, type TipoMovimiento } from './tipos';

/** El reto, tal como quedó bloqueado en la transacción. */
export interface ContextoReto {
  readonly activo: boolean;
  readonly topeTotal: number;
  readonly entregados: number;
  readonly vecesPorPersona: number;
  /** Veces que este asistente ya completó el reto. */
  readonly completadas: number;
}

/** Lo que hay que saber antes de agregar un movimiento. Lo arma el servicio con las filas bloqueadas. */
export interface ContextoMovimiento {
  readonly saldo: number;
  /** Suma de lo ganado por el asistente con retos y check-in. */
  readonly ganadosPersona: number;
  readonly topePuntosPersona: number | null;
  readonly reto?: ContextoReto;
}

/**
 * Reglas del libro (HU-101 §3). Función pura: sin base, sin reloj.
 * Devuelve el código de error del catálogo, o `null` si el movimiento se puede agregar.
 */
export function validateMovimiento(
  movimiento: { readonly tipo: TipoMovimiento; readonly puntos: number },
  contexto: ContextoMovimiento,
): CodigoError | null {
  if (movimiento.tipo === 'reto') {
    const reto = contexto.reto;
    if (!reto) {
      throw new Error('Un movimiento de reto necesita el contexto del reto');
    }
    if (!reto.activo) {
      return 'RETO_NO_DISPONIBLE';
    }
    if (reto.completadas >= reto.vecesPorPersona) {
      return 'RETO_YA_COMPLETADO';
    }
    if (reto.entregados >= reto.topeTotal) {
      return 'TOPE_ALCANZADO';
    }
  }

  if (
    isTipoGanancia(movimiento.tipo) &&
    contexto.topePuntosPersona !== null &&
    movimiento.puntos > 0 &&
    contexto.ganadosPersona + movimiento.puntos > contexto.topePuntosPersona
  ) {
    return 'TOPE_PUNTOS_PERSONA';
  }

  if (contexto.saldo + movimiento.puntos < 0) {
    return 'SALDO_INSUFICIENTE';
  }

  return null;
}
