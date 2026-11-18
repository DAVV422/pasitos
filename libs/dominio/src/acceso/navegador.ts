/**
 * Qué navegador es, a partir del User-Agent (D42, Aplicaciones web §2.8). Lo usan la app (antes
 * de vincular) y el API (que lo confirma). Aproximado a propósito: solo lo que decide si se vincula.
 */

/** Gmail, WhatsApp, Instagram… abren los enlaces en su propio navegador, que pierde la llave (D42). */
export function isNavegadorDeOtraApp(agente: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|GSA\/|LinkedInApp|musical_ly|BytedanceWebview|TikTok|Outlook|; wv\)/.test(
    agente,
  );
}

export type NombreNavegador = 'chrome' | 'edge' | 'safari' | 'samsung' | 'firefox' | 'otro';

export interface Navegador {
  readonly nombre: NombreNavegador;
  /** Versión principal (`16.4` → 16.4); `null` si no se pudo leer. */
  readonly version: number | null;
}

function version(agente: string, patron: RegExp): number | null {
  const encontrado = patron.exec(agente);
  if (!encontrado?.[1]) return null;
  return Number.parseFloat(encontrado[1].replace('_', '.'));
}

export function getNavegador(agente: string): Navegador {
  if (/SamsungBrowser\//.test(agente)) {
    return { nombre: 'samsung', version: version(agente, /SamsungBrowser\/(\d+(?:\.\d+)?)/) };
  }
  if (/Edg(?:A|iOS)?\//.test(agente)) {
    return { nombre: 'edge', version: version(agente, /Edg(?:A|iOS)?\/(\d+)/) };
  }
  if (/Firefox\/|FxiOS\//.test(agente)) {
    return { nombre: 'firefox', version: version(agente, /(?:Firefox|FxiOS)\/(\d+)/) };
  }
  // En iPhone todos usan el motor de Safari: cuenta la versión de iOS.
  if (/iPhone|iPad|iPod/.test(agente)) {
    return { nombre: 'safari', version: version(agente, /OS (\d+_\d+)/) };
  }
  if (/Chrome\/|CriOS\//.test(agente)) {
    return { nombre: 'chrome', version: version(agente, /(?:Chrome|CriOS)\/(\d+)/) };
  }
  if (/Safari\//.test(agente)) {
    return { nombre: 'safari', version: version(agente, /Version\/(\d+(?:\.\d+)?)/) };
  }
  return { nombre: 'otro', version: null };
}

/** Las versiones mínimas de D42. */
const MINIMAS: Readonly<Record<Exclude<NombreNavegador, 'otro'>, number>> = {
  chrome: 111,
  edge: 111,
  safari: 16.4,
  samsung: 22,
  firefox: 128,
};

/**
 * Si el navegador está entre los soportados (D42). Uno que no se reconoce **se acepta**: es mejor
 * dejar entrar a alguien raro que bloquear a un navegador nuevo.
 */
export function isNavegadorSoportado(agente: string): boolean {
  if (/MSIE |Trident\//.test(agente) || isNavegadorDeOtraApp(agente)) {
    return false;
  }
  const { nombre, version: v } = getNavegador(agente);
  if (nombre === 'otro' || v === null) {
    return true;
  }
  return v >= MINIMAS[nombre];
}

/** Un celular o una tablet (para no vincular desde una computadora). */
export function isCelular(agente: string, puntosTactiles = 0): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/.test(agente)) {
    return true;
  }
  // iPadOS dice "Macintosh": se reconoce por la pantalla táctil.
  return /Macintosh/.test(agente) && puntosTactiles > 1;
}
