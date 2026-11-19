/**
 * El carnet de identidad (HU-321, D60): texto libre, sin validar su formato. Para no verificar el
 * mismo carnet en dos cuentas se compara el número **normalizado**: solo los dígitos y el
 * complemento en mayúsculas, sin la extensión del departamento ni espacios.
 *
 * - `"4567890 LP"` → `"4567890"`
 * - `"4567890-1B"` → `"4567890-1B"`
 * - `" 4567890 - 1b  CB "` → `"4567890-1B"`
 */
export function normalizeCi(ci: string): string {
  const limpio = ci.toUpperCase().replace(/\s+/g, ' ').trim();
  const partes = /^(\d+)(?:\s*-\s*([0-9A-Z]{1,3}))?/.exec(limpio);
  if (!partes) return limpio.replace(/\s/g, '');
  const [, numero = '', complemento] = partes;
  return complemento ? `${numero}-${complemento}` : numero;
}

export const OPCIONES_PEDIR_CI = ['no', 'opcional'] as const;
export type PedirCi = (typeof OPCIONES_PEDIR_CI)[number];

/** Los puntos por verificar el carnet, por defecto (HU-321 §2). */
export const PUNTOS_VERIFICACION_CI = 30;
/** El tope del reto de verificación: alcanza para todo el evento. */
export const TOPE_VERIFICACION_CI = 100_000;
export const NOMBRE_RETO_VERIFICACION_CI = 'Verificación de carnet';
