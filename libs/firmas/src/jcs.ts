/**
 * JSON canónico (RFC 8785) para lo que tiene el libro: enteros, textos, booleanos, listas y objetos.
 * Claves ordenadas por unidades UTF-16; números solo enteros seguros. Sin dependencias.
 */
export function canonicalizeJson(valor: unknown): string {
  if (valor === null) {
    return 'null';
  }
  switch (typeof valor) {
    case 'boolean':
      return valor ? 'true' : 'false';
    case 'string':
      return JSON.stringify(valor);
    case 'number':
      if (!Number.isSafeInteger(valor)) {
        throw new TypeError(`Solo se admiten enteros en el libro: ${valor}`);
      }
      return Object.is(valor, -0) ? '0' : String(valor);
    case 'object': {
      if (Array.isArray(valor)) {
        return `[${valor.map((elemento) => canonicalizeJson(elemento)).join(',')}]`;
      }
      const entradas = Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entradas.map(([clave, v]) => `${JSON.stringify(clave)}:${canonicalizeJson(v)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Tipo no admitido en JSON canónico: ${typeof valor}`);
  }
}
