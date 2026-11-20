import qrcode from 'qrcode-generator';
import sharp from 'sharp';

/**
 * El QR fijo para imprimir (HU-319 §2): el nombre del evento arriba, el QR grande y el **nombre del
 * QR en chico debajo**, para saber cuál es cada cartel. En PNG (con `sharp`) o en un PDF A4 armado
 * a mano: es un dibujo de rectángulos y dos líneas de texto, no hace falta otra librería.
 */
export interface Imprimible {
  readonly evento: string;
  readonly nombreQr: string;
  readonly url: string;
}

export function getModulos(texto: string): boolean[][] {
  const codigo = qrcode(0, 'M');
  codigo.addData(texto);
  codigo.make();
  const n = codigo.getModuleCount();
  return Array.from({ length: n }, (_, fila) =>
    Array.from({ length: n }, (_, columna) => codigo.isDark(fila, columna)),
  );
}

/** Los módulos oscuros de cada fila, juntos en tramos (menos rectángulos). */
export function getTramos(modulos: boolean[][]): { fila: number; desde: number; largo: number }[] {
  const tramos: { fila: number; desde: number; largo: number }[] = [];
  modulos.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      if (!fila[x]) {
        x += 1;
        continue;
      }
      const desde = x;
      while (x < fila.length && fila[x]) x += 1;
      tramos.push({ fila: y, desde, largo: x - desde });
    }
  });
  return tramos;
}

function escapeXml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const ANCHO_PNG = 1200;
const ALTO_PNG = 1500;
const LADO_QR_PNG = 1000;

export async function renderPng(datos: Imprimible): Promise<Buffer> {
  const modulos = getModulos(datos.url);
  const celda = LADO_QR_PNG / modulos.length;
  const x0 = (ANCHO_PNG - LADO_QR_PNG) / 2;
  const y0 = 230;
  const camino = getTramos(modulos)
    .map(
      (t) =>
        `M${x0 + t.desde * celda},${y0 + t.fila * celda}h${t.largo * celda}v${celda}h${-t.largo * celda}z`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO_PNG}" height="${ALTO_PNG}">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="50%" y="140" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="#0f172a">${escapeXml(datos.evento)}</text>
<path d="${camino}" fill="#000000" shape-rendering="crispEdges"/>
<text x="50%" y="${y0 + LADO_QR_PNG + 110}" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#0f172a">Escanea para entrar</text>
<text x="50%" y="${y0 + LADO_QR_PNG + 180}" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#475569">${escapeXml(datos.nombreQr)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Texto para Helvetica (WinAnsi ≈ Latin-1): los acentos del español entran; lo demás, `?`. */
export function toTextoPdf(texto: string): string {
  let salida = '';
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 63;
    const latino = codigo >= 32 && codigo <= 255 && !(codigo >= 127 && codigo < 160);
    const c = latino ? String.fromCharCode(codigo) : '?';
    salida += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return salida;
}

/** El ancho aproximado de un texto en Helvetica, para centrarlo (0,55 del tamaño por letra). */
function centrar(texto: string, tamano: number, anchoPagina: number): number {
  return Math.max(36, (anchoPagina - [...texto].length * tamano * 0.55) / 2);
}

export function renderPdf(datos: Imprimible): Buffer {
  const ANCHO = 595;
  const ALTO = 842;
  const LADO = 440;
  const modulos = getModulos(datos.url);
  const celda = LADO / modulos.length;
  const x0 = (ANCHO - LADO) / 2;
  const yArriba = 660;
  const f = (n: number) => n.toFixed(2);
  const rectangulos = getTramos(modulos)
    .map(
      (t) =>
        `${f(x0 + t.desde * celda)} ${f(yArriba - (t.fila + 1) * celda)} ${f(t.largo * celda)} ${f(celda)} re`,
    )
    .join('\n');
  const evento = datos.evento.slice(0, 60);
  const nombre = datos.nombreQr.slice(0, 60);
  const contenido = [
    '0 0 0 rg',
    `BT /F2 26 Tf ${f(centrar(evento, 26, ANCHO))} 730 Td (${toTextoPdf(evento)}) Tj ET`,
    rectangulos,
    'f',
    `BT /F1 18 Tf ${f(centrar('Escanea para entrar', 18, ANCHO))} 180 Td (Escanea para entrar) Tj ET`,
    '0.28 0.33 0.41 rg',
    `BT /F1 12 Tf ${f(centrar(nombre, 12, ANCHO))} 150 Td (${toTextoPdf(nombre)}) Tj ET`,
  ].join('\n');
  return wrapPdf(contenido, ANCHO, ALTO);
}

/** Un PDF de una página con Helvetica y Helvetica-Bold (`/F1`, `/F2`) y el dibujo dado. */
export function wrapPdf(contenido: string, ancho: number, alto: number): Buffer {
  const flujo = Buffer.from(contenido, 'latin1');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${flujo.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((objeto, i) => {
    posiciones.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const posicion of posiciones) pdf += `${String(posicion).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
