import type { DatosReporte, StellarReporte } from '@pasitos/dominio';
import { getModulos, getTramos, toTextoPdf, wrapPdf } from '../registro/imprimible';

/**
 * El PDF del reporte (HU-402 §8, R2): A4, una página, en blanco y negro, armado a mano como el
 * imprimible de HU-319 (rectángulos y Helvetica). Si algo no entra, se recortan las listas, no la
 * letra. Es siempre del evento completo.
 */
const ANCHO = 595;
const ALTO = 842;
const MARGEN = 40;
const MAX_RETOS = 10;

const f = (n: number) => n.toFixed(2);

function texto(x: number, y: number, tamano: number, valor: string, negrita = false): string {
  return `BT /${negrita ? 'F2' : 'F1'} ${tamano} Tf ${f(x)} ${f(y)} Td (${toTextoPdf(valor)}) Tj ET`;
}

/** Corta un texto para que entre en `ancho` puntos (≈ 0,5 del tamaño por letra). */
function cortar(valor: string, tamano: number, ancho: number): string {
  const max = Math.floor(ancho / (tamano * 0.5));
  return valor.length > max ? `${valor.slice(0, max - 3)}...` : valor;
}

const gris = (nivel: number) => `${nivel} ${nivel} ${nivel} rg`;

function formatFecha(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: zona,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatHora(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

const miles = (n: number) => new Intl.NumberFormat('es-BO').format(n);

export function renderPdfReporte(
  datos: DatosReporte,
  stellar: StellarReporte,
  enlacePublico: string | null,
): Buffer {
  const zona = datos.evento.zonaHoraria;
  const partes: string[] = ['0 0 0 rg'];
  let y = ALTO - MARGEN - 18;

  // Encabezado.
  partes.push(texto(MARGEN, y, 20, cortar(datos.evento.nombre, 20, ANCHO - 2 * MARGEN), true));
  y -= 18;
  const subtitulo = [
    datos.evento.organizacion,
    formatFecha(datos.evento.inicioAt, zona),
    datos.evento.lugar,
  ]
    .filter(Boolean)
    .join(' · ');
  partes.push(gris(0.3), texto(MARGEN, y, 10, cortar(subtitulo, 10, ANCHO - 2 * MARGEN)));
  y -= 14;
  if (datos.evento.tipo === 'prueba') {
    partes.push(texto(MARGEN, y, 10, 'Evento de prueba', true));
    y -= 14;
  }
  if (datos.pequeno) {
    partes.push(
      texto(
        MARGEN,
        y,
        9,
        'Evento con menos de 30 personas: por privacidad se muestran solo los totales.',
      ),
    );
    y -= 14;
  }

  // Los cuatro números grandes.
  y -= 8;
  const a = datos.asistencia;
  const grandes: [string, string][] = [
    ['Presentes', miles(a.presentes)],
    ['Tasa de asistencia', a.tasa === null ? '-' : `${Math.round(a.tasa * 100)} %`],
    ['Participaciones', miles(datos.participacion.participaciones)],
    ['Premios entregados', miles(datos.premios.entregados)],
  ];
  const anchoCaja = (ANCHO - 2 * MARGEN - 3 * 10) / 4;
  grandes.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + i * (anchoCaja + 10);
    partes.push(
      '0 0 0 RG 0.8 w',
      `${f(x)} ${f(y - 52)} ${f(anchoCaja)} 52 re S`,
      gris(0),
      texto(x + 8, y - 26, 20, valor, true),
      gris(0.3),
      texto(x + 8, y - 44, 9, etiqueta),
    );
  });
  y -= 76;

  // Barras por reto (las 10 con más participaciones).
  const barras = (
    titulo: string,
    filas: readonly { nombre: string; valor: number; detalle?: string }[],
    resto: number,
    unidad: string,
  ) => {
    partes.push(gris(0), texto(MARGEN, y, 12, titulo, true));
    y -= 16;
    const max = Math.max(1, ...filas.map((r) => r.valor));
    const xBarra = MARGEN + 190;
    const anchoBarra = ANCHO - MARGEN - xBarra - 70;
    for (const fila of filas) {
      partes.push(gris(0), texto(MARGEN, y, 9, cortar(fila.nombre, 9, 185)));
      partes.push(
        gris(0.45),
        `${f(xBarra)} ${f(y - 1)} ${f((fila.valor / max) * anchoBarra)} 9 re f`,
      );
      partes.push(
        gris(0),
        texto(xBarra + anchoBarra + 6, y, 9, `${miles(fila.valor)}${fila.detalle ?? ''}`),
      );
      y -= 14;
    }
    if (resto > 0) {
      partes.push(gris(0.3), texto(MARGEN, y, 9, `y ${resto} ${unidad} más`));
      y -= 14;
    }
    y -= 8;
  };

  const retos = datos.participacion.porReto;
  if (retos.length > 0) {
    barras(
      'Participaciones por reto',
      retos.slice(0, MAX_RETOS).map((r) => ({
        nombre: r.nombre,
        valor: r.participaciones,
        detalle: ` / ${miles(r.tope)}`,
      })),
      Math.max(0, retos.length - MAX_RETOS),
      retos.length - MAX_RETOS === 1 ? 'reto' : 'retos',
    );
  }

  // Asistencia por franja (si no es solo totales): personas activas por hora.
  const franjas = a.franjas ?? [];
  if (franjas.length > 0) {
    const visibles = franjas.slice(0, 12);
    barras(
      'Personas activas por hora',
      visibles.map((h) => ({ nombre: formatHora(h.hora, zona), valor: h.activos })),
      franjas.length - visibles.length,
      'horas',
    );
  }

  // Puntos y premios, en dos columnas.
  const p = datos.puntos;
  const nombrePuntos = datos.evento.nombrePuntos;
  partes.push(gris(0), texto(MARGEN, y, 12, `${cap(nombrePuntos)}`, true));
  partes.push(texto(ANCHO / 2, y, 12, 'Premios', true));
  y -= 16;
  const columnaPuntos = [
    `Ganados: ${miles(p.ganados)}`,
    `Canjeados: ${miles(p.canjeados)}`,
    `Ajustados a mano: ${miles(p.ajustados)}`,
    `Vencidos al cierre: ${miles(p.vencidos)}`,
  ];
  const premios = datos.premios.porPremio.slice(0, 5);
  const columnaPremios = [
    `Canjes: ${miles(datos.premios.canjes)} (${miles(datos.premios.gratuitos)} gratuitos)`,
    ...premios.map((x) => cortar(`${x.nombre}: ${miles(x.entregados)} entregados`, 9, 230)),
  ];
  const restoPremios = datos.premios.porPremio.length - premios.length;
  if (restoPremios > 0) columnaPremios.push(`y ${restoPremios} premios más`);
  const lineas = Math.max(columnaPuntos.length, columnaPremios.length);
  for (let i = 0; i < lineas; i++) {
    if (columnaPuntos[i]) partes.push(texto(MARGEN, y, 9, columnaPuntos[i] ?? ''));
    if (columnaPremios[i]) partes.push(texto(ANCHO / 2, y, 9, columnaPremios[i] ?? ''));
    y -= 13;
  }

  // Pie de Stellar, siempre abajo.
  const lado = enlacePublico ? 78 : 0;
  const pie = MARGEN + Math.max(lado, 56);
  partes.push('0 0 0 RG 0.5 w', `${MARGEN} ${f(pie + 8)} m ${ANCHO - MARGEN} ${f(pie + 8)} l S`);
  const red =
    stellar.red === 'testnet' ? 'la red de pruebas de Stellar (testnet)' : 'una red local';
  const lineasPie = [
    stellar.estado === 'registrado' ? `Sellado en ${red}.` : `El cierre en ${red} está pendiente.`,
    stellar.contratoId ? `Contrato: ${stellar.contratoId}` : null,
    stellar.huellaFinal
      ? `Huella final: ${stellar.huellaFinal.slice(0, 16)}...${stellar.huellaFinal.slice(-8)}`
      : null,
    enlacePublico ? `Reporte público: ${enlacePublico}` : null,
  ].filter((l): l is string => l !== null);
  let yPie = pie - 6;
  for (const linea of lineasPie) {
    partes.push(
      gris(0.2),
      texto(MARGEN, yPie, 8, cortar(linea, 8, ANCHO - 2 * MARGEN - lado - 10)),
    );
    yPie -= 12;
  }
  if (enlacePublico) {
    const modulos = getModulos(enlacePublico);
    const celda = lado / modulos.length;
    const x0 = ANCHO - MARGEN - lado;
    const yArriba = pie;
    partes.push(
      '0 0 0 rg',
      getTramos(modulos)
        .map(
          (t) =>
            `${f(x0 + t.desde * celda)} ${f(yArriba - (t.fila + 1) * celda)} ${f(t.largo * celda)} ${f(celda)} re`,
        )
        .join('\n'),
      'f',
    );
  }
  return wrapPdf(partes.join('\n'), ANCHO, ALTO);
}

const cap = (valor: string) => valor.charAt(0).toUpperCase() + valor.slice(1);
