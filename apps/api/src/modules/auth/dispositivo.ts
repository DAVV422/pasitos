/**
 * "Chrome en Windows", a partir del User-Agent, para la lista de sesiones abiertas (HU-201 §6).
 * Aproximado a propósito: no guarda versiones ni el User-Agent completo.
 */
export function describeDispositivo(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  const sistema = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iPhone'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (navegador && sistema) {
    return `${navegador} en ${sistema}`;
  }
  return navegador ?? sistema ?? 'Navegador desconocido';
}
