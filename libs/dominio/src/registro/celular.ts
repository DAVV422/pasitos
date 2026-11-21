/**
 * El celular del asistente (HU-411): se guarda en formato internacional (E.164, `+59171234567`).
 * Pasitos no manda mensajes: es para que el organizador contacte a la gente.
 */

/** Si el evento lo pide (Reglas de la puerta). Por defecto, `opcional`. */
export const MODOS_CELULAR = ['no', 'opcional', 'obligatorio'] as const;
export type ModoCelular = (typeof MODOS_CELULAR)[number];

export const NOMBRES_MODO_CELULAR: Readonly<Record<ModoCelular, string>> = {
  no: 'No pedir',
  opcional: 'Pedirlo, opcional',
  obligatorio: 'Pedirlo, obligatorio',
};

/** El mismo formato que el `check` de `asistentes.celular`. */
export const FORMATO_CELULAR = /^\+[1-9][0-9]{7,14}$/;

export const MENSAJE_CELULAR_INVALIDO =
  'Revisa el número: 8 dígitos, o con el código del país (+54…).';
export const MENSAJE_CELULAR_REQUERIDO = 'Escribe tu celular.';

/**
 * Lo que escribió la persona → `+59171234567`, o `null` si no es un número que sirva.
 * - Bolivia sin código: 8 dígitos que empiezan con 6 o 7.
 * - Con código: `+` o `00` y de 8 a 15 dígitos.
 * Se ignoran espacios, guiones, puntos y paréntesis.
 */
export function normalizeCelular(texto: string): string | null {
  const limpio = texto.trim().replace(/[\s\-.()]/g, '');
  if (/^[67][0-9]{7}$/.test(limpio)) return `+591${limpio}`;
  const conCodigo = limpio.startsWith('00') ? `+${limpio.slice(2)}` : limpio;
  return FORMATO_CELULAR.test(conCodigo) ? conCodigo : null;
}

/** `+59171234567` → `+591 7123 4567`. De otro país, tal cual (el código puede tener 1 a 3 dígitos). */
export function formatCelular(celular: string | null): string | null {
  if (!celular) return null;
  const bolivia = /^\+591([0-9]{4})([0-9]{4})$/.exec(celular);
  return bolivia ? `+591 ${bolivia[1]} ${bolivia[2]}` : celular;
}

/** `+59171234567` → `•••• 4567`. Para el registrador. */
export function maskCelular(celular: string | null): string | null {
  return celular ? `•••• ${celular.slice(-4)}` : null;
}

/** El enlace de WhatsApp para el organizador: `https://wa.me/59171234567`. */
export function getEnlaceWhatsapp(celular: string): string {
  return `https://wa.me/${celular.replace(/^\+/, '')}`;
}
