/**
 * El CSV de la lista de invitados (HU-210 §4 y §5): leerlo, reconocer las columnas y escapar las
 * celdas al exportar. Sin dependencias: lo usan el trabajador (importar y exportar) y las pruebas.
 */

export const MAX_FILAS_CSV = 5_000;

/** Separador de la primera línea: `,` o `;`, el que aparezca más fuera de comillas. */
export function detectSeparador(texto: string): ',' | ';' {
  let comas = 0;
  let puntoYComa = 0;
  let enComillas = false;
  for (const c of texto) {
    if (c === '"') enComillas = !enComillas;
    else if (!enComillas && (c === '\n' || c === '\r')) break;
    else if (!enComillas && c === ',') comas++;
    else if (!enComillas && c === ';') puntoYComa++;
  }
  return puntoYComa > comas ? ';' : ',';
}

/** Filas del CSV (comillas dobles estándar, `""` dentro de comillas, CRLF o LF). Sin las vacías. */
export function parseCsv(entrada: string): string[][] {
  const texto = entrada.startsWith('\uFEFF') ? entrada.slice(1) : entrada;
  const separador = detectSeparador(texto);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') {
        enComillas = false;
      } else {
        celda += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === separador) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += c;
    }
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

/** Minúsculas, sin tildes y sin espacios de más: para comparar encabezados y nombres. */
export function normalizeTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const NOMBRES_COLUMNA = {
  nombre: ['nombre', 'nombre completo', 'name', 'full name'],
  nombres: ['nombres', 'first name'],
  apellidos: ['apellidos', 'apellido', 'last name'],
  email: ['correo', 'email', 'e-mail', 'mail', 'correo electronico'],
  codigoExterno: ['codigo', 'codigo externo', 'id', 'ticket'],
} as const;

export type ColumnaReconocida = keyof typeof NOMBRES_COLUMNA;

export interface Columnas {
  /** Índice de cada columna reconocida. */
  readonly indices: Partial<Record<ColumnaReconocida, number>>;
  readonly reconocidas: readonly string[];
  readonly ignoradas: readonly string[];
}

export function mapColumnas(encabezados: readonly string[]): Columnas {
  const indices: Partial<Record<ColumnaReconocida, number>> = {};
  const reconocidas: string[] = [];
  const ignoradas: string[] = [];
  encabezados.forEach((encabezado, i) => {
    const normalizado = normalizeTexto(encabezado);
    const columna = (Object.keys(NOMBRES_COLUMNA) as ColumnaReconocida[]).find((c) =>
      (NOMBRES_COLUMNA[c] as readonly string[]).includes(normalizado),
    );
    if (columna && indices[columna] === undefined) {
      indices[columna] = i;
      reconocidas.push(encabezado.trim());
    } else if (encabezado.trim() !== '') {
      ignoradas.push(encabezado.trim());
    }
  });
  return { indices, reconocidas, ignoradas };
}

export function hasColumnaNombre(columnas: Columnas): boolean {
  return columnas.indices.nombre !== undefined || columnas.indices.nombres !== undefined;
}

export interface FilaCsv {
  /** Número de fila como en la planilla: el encabezado es la 1. */
  readonly fila: number;
  readonly nombre: string;
  readonly email: string | null;
  readonly codigoExterno: string | null;
}

/** Lee las filas de datos con las columnas reconocidas; junta `nombres` y `apellidos`. */
export function readFilas(filas: readonly string[][], columnas: Columnas): FilaCsv[] {
  const { indices } = columnas;
  const celda = (fila: readonly string[], i: number | undefined) =>
    i === undefined ? '' : (fila[i] ?? '').replace(/\s+/g, ' ').trim();
  return filas.map((f, i) => {
    const nombre =
      indices.nombre !== undefined
        ? celda(f, indices.nombre)
        : `${celda(f, indices.nombres)} ${celda(f, indices.apellidos)}`.trim();
    const email = celda(f, indices.email).toLowerCase();
    const codigo = celda(f, indices.codigoExterno);
    return {
      fila: i + 2,
      nombre,
      email: email === '' ? null : email,
      codigoExterno: codigo === '' ? null : codigo,
    };
  });
}

/**
 * Una celda del CSV exportado. Lo que empieza con `=`, `+`, `-`, `@`, tab o retorno lleva una
 * comilla simple adelante: así Excel no lo toma como fórmula (inyección CSV).
 */
export function escapeCeldaCsv(valor: string | number | null | undefined): string {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) {
    texto = `'${texto}`;
  }
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** El CSV completo: UTF-8 con BOM (para Excel), separado por comas, con CRLF. */
export function buildCsv(
  encabezados: readonly string[],
  filas: readonly (readonly (string | number | null)[])[],
): string {
  const lineas = [encabezados, ...filas].map((f) => f.map(escapeCeldaCsv).join(','));
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

/** `valeria@example.com` → `va•••@example.com`. Para el registrador y la bitácora. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local = '', dominio = ''] = email.split('@');
  return `${local.slice(0, 2)}•••@${dominio}`;
}
