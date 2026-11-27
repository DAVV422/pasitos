/**
 * Enlaces y redes sociales de un reto. Se detecta la red por el dominio para mostrar su ícono y
 * un texto claro si el organizador no escribió uno; también separa la descripción en fragmentos
 * de texto y enlaces `https://` para que cualquier link pegado sea clicable.
 */
export const REDES_ENLACE_RETO = ['facebook', 'instagram', 'tiktok', 'x', 'web'] as const;
export type RedEnlaceReto = (typeof REDES_ENLACE_RETO)[number];

export interface EnlaceReto {
  readonly url: string;
  readonly etiqueta: string | null;
}

export const NOMBRES_RED_ENLACE: Readonly<Record<RedEnlaceReto, string>> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  web: 'Abrir enlace',
};

const DOMINIOS_RED: readonly {
  readonly red: RedEnlaceReto;
  readonly sufijos: readonly string[];
}[] = [
  { red: 'facebook', sufijos: ['facebook.com', 'fb.com', 'fb.watch'] },
  { red: 'instagram', sufijos: ['instagram.com', 'instagr.am'] },
  { red: 'tiktok', sufijos: ['tiktok.com'] },
  { red: 'x', sufijos: ['x.com', 'twitter.com', 't.co'] },
];

/** Qué red social corresponde a una URL `https://` según su dominio (`web` si es otro sitio). */
export function detectRedEnlace(url: string): RedEnlaceReto {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const { red, sufijos } of DOMINIOS_RED) {
      if (sufijos.some((s) => host === s || host.endsWith(`.${s}`))) return red;
    }
    return 'web';
  } catch {
    return 'web';
  }
}

/** El texto visible de un enlace: su etiqueta personalizada, o el nombre de la red detectada. */
export function getEtiquetaEnlace(enlace: EnlaceReto): string {
  const limpia = enlace.etiqueta?.trim();
  if (limpia) return limpia;
  return NOMBRES_RED_ENLACE[detectRedEnlace(enlace.url)];
}

export interface FragmentoTextoEnlace {
  readonly tipo: 'texto' | 'enlace';
  readonly texto: string;
  readonly url?: string;
}

const REGEX_URL_HTTPS = /https:\/\/[^\s<>"']+/g;
const PUNTUACION_FINAL = /[.,;:!?)]+$/;

/**
 * Separa un texto en fragmentos planos y enlaces `https://...`, dejando fuera la puntuación final
 * (por ejemplo, un punto o paréntesis al cerrar una frase).
 */
export function splitTextoConEnlaces(texto: string): FragmentoTextoEnlace[] {
  const resultado: FragmentoTextoEnlace[] = [];
  let cursor = 0;
  for (const coincidencia of texto.matchAll(REGEX_URL_HTTPS)) {
    const inicio = coincidencia.index ?? 0;
    const bruto = coincidencia[0];
    const sobrante = PUNTUACION_FINAL.exec(bruto)?.[0] ?? '';
    const url = sobrante ? bruto.slice(0, -sobrante.length) : bruto;
    if (url.length <= 'https://'.length) continue;
    if (inicio > cursor) {
      resultado.push({ tipo: 'texto', texto: texto.slice(cursor, inicio) });
    }
    resultado.push({ tipo: 'enlace', texto: url, url });
    cursor = inicio + url.length;
  }
  if (cursor < texto.length) {
    resultado.push({ tipo: 'texto', texto: texto.slice(cursor) });
  }
  return resultado;
}
