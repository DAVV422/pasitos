/**
 * Los QR de registro (HU-319, D60): con ellos la gente crea su cuenta sola, sin lista. El
 * rotativo cambia cada 30 s (lo muestra un celular del equipo o una tablet); el fijo se imprime.
 */
export const TIPOS_QR_REGISTRO = ['rotativo', 'fijo'] as const;
export type TipoQrRegistro = (typeof TIPOS_QR_REGISTRO)[number];

export const MUESTRAS_QR_REGISTRO = ['miembro', 'pantalla', 'impreso'] as const;
export type MuestraQrRegistro = (typeof MUESTRAS_QR_REGISTRO)[number];

/** Cada cuánto cambia el QR rotativo y cuánto se acepta el anterior (HU-319 §3, §4). */
export const FRANJA_REGISTRO_MS = 30_000;
export const GRACIA_REGISTRO_MS = 5_000;
/** Cuánto dura el permiso de registro para terminar el formulario. */
export const PERMISO_REGISTRO_MS = 10 * 60_000;

/** Lo que ve el panel: `activo` o por qué no sirve ahora. */
export type EstadoQrRegistro = 'activo' | 'invalidado' | 'fuera_de_horario' | 'tope_lleno';

export interface QrRegistroCalculable {
  readonly estado: string;
  readonly desde: Date | null;
  readonly hasta: Date | null;
  readonly tope: number | null;
  readonly registros: number;
}

export function getEstadoQrRegistro(qr: QrRegistroCalculable, ahora: Date): EstadoQrRegistro {
  if (qr.estado !== 'activo') return 'invalidado';
  const momento = ahora.getTime();
  if ((qr.desde && momento < qr.desde.getTime()) || (qr.hasta && momento >= qr.hasta.getTime())) {
    return 'fuera_de_horario';
  }
  if (qr.tope !== null && qr.registros >= qr.tope) return 'tope_lleno';
  return 'activo';
}

/** La franja de 30 s de un momento (hora del servidor). */
export function getFranjaRegistro(ms: number): number {
  return Math.floor(ms / FRANJA_REGISTRO_MS);
}

/**
 * Si la franja de un QR rotativo sirve ahora: la actual, o la anterior durante los 5 s siguientes
 * a su fin (HU-319 §4).
 */
export function isFranjaRegistroVigente(franja: number, ahoraMs: number): boolean {
  const actual = getFranjaRegistro(ahoraMs);
  if (franja === actual) return true;
  return franja === actual - 1 && ahoraMs - actual * FRANJA_REGISTRO_MS < GRACIA_REGISTRO_MS;
}

/**
 * Los últimos 3 dígitos del número del carnet, sin el complemento (`-1B`) ni la extensión (`LP`),
 * para mostrarlo enmascarado (`•••890`).
 */
export function getCiUltimos(ci: string): string | null {
  const digitos = (ci.split('-')[0] ?? '').replace(/\D/g, '');
  return digitos.length > 0 ? digitos.slice(-3) : null;
}

/** `•••567`, o `null` si no hay carnet. */
export function maskCi(ultimos: string | null): string | null {
  return ultimos ? `•••${ultimos}` : null;
}

/** Cómo marca presente un QR según quién lo muestra (HU-301 §3). */
export function getMetodoAutoregistro(
  muestra: MuestraQrRegistro,
): 'autoregistro_equipo' | 'autoregistro_tablet' | 'autoregistro_impreso' {
  if (muestra === 'miembro') return 'autoregistro_equipo';
  return muestra === 'pantalla' ? 'autoregistro_tablet' : 'autoregistro_impreso';
}

export const NOMBRES_ESTADO_QR_REGISTRO: Readonly<Record<EstadoQrRegistro, string>> = {
  activo: 'Activo',
  invalidado: 'Invalidado',
  fuera_de_horario: 'Fuera de horario',
  tope_lleno: 'Tope lleno',
};
