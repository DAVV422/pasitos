/**
 * El reporte del evento (HU-402). Los indicadores se arman en `libs/libro/src/reporte.ts`; aquí van
 * su forma, las reglas de privacidad y el CSV, que no dependen de la base.
 */

/** Versión del formato de `reportes.datos`. Si cambia, *Regenerar* lo vuelve a armar. */
export const VERSION_REPORTE = 1;

/** Con menos presentes, el evento es *pequeño*: solo totales (§6, igual que los lotes públicos). */
export const UMBRAL_EVENTO_PEQUENO = 30;

/** Un tramo con menos personas activas muestra solo totales (§3.1). */
export const UMBRAL_TRAMO = 5;

/** El selector del tramo va de a 15 minutos. */
export const PASO_TRAMO_MIN = 15;

/** Cómo entraron, agrupado como lo dice el reporte (los `metodo` de `check_ins`). */
export const FORMAS_DE_ENTRAR = {
  escaneo: 'Escaneando Mi entrada',
  busqueda: 'Búsqueda manual',
  puerta: 'Registro en la puerta',
  autorregistro: 'Autorregistro con QR',
  carnet: 'Verificación de carnet',
} as const;
export type FormaDeEntrar = keyof typeof FORMAS_DE_ENTRAR;

export function getFormaDeEntrar(metodo: string): FormaDeEntrar {
  if (metodo === 'escaneo_entrada') return 'escaneo';
  if (metodo === 'busqueda') return 'busqueda';
  if (metodo === 'registro_puerta' || metodo === 'vinculacion_puerta') return 'puerta';
  if (metodo === 'verificacion_ci') return 'carnet';
  return 'autorregistro';
}

export interface TramoReporte {
  /** ISO, incluido. */
  readonly desde: string;
  /** ISO, no incluido: un movimiento justo en *Hasta* no cuenta. */
  readonly hasta: string;
}

export interface FranjaReporte {
  /** El inicio de la hora (ISO). */
  readonly hora: string;
  readonly checkIns: number;
  readonly activos: number;
}

export interface RetoReporte {
  readonly numero: number;
  readonly nombre: string;
  readonly tipo: string;
  readonly participaciones: number;
  readonly tope: number;
  readonly lugar: string | null;
  readonly sponsor: string | null;
}

export interface DatosReporte {
  readonly version: number;
  readonly generadoAt: string;
  readonly evento: {
    readonly nombre: string;
    readonly organizacion: string;
    readonly tipo: string;
    readonly zonaHoraria: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly cerradoAt: string | null;
    readonly lugar: string | null;
    readonly logo: string | null;
    readonly nombrePuntos: string;
    /** Para los atajos del tramo: una por actividad de la agenda. */
    readonly agenda: readonly {
      readonly titulo: string;
      readonly inicioAt: string;
      readonly finAt: string;
    }[];
  };
  /** Del primer al último movimiento (de a 15 min): dentro de esto se elige el tramo. */
  readonly limites: TramoReporte;
  /** `null`: el evento completo. */
  readonly tramo: TramoReporte | null;
  /** Menos de 30 presentes en el evento (§6). */
  readonly pequeno: boolean;
  /** Sin desgloses: evento pequeño o tramo con menos de 5 personas activas. */
  readonly soloTotales: boolean;
  readonly asistencia: {
    readonly invitados: number;
    readonly presentes: number;
    readonly presentesDeLista: number;
    /** Presentes de la lista ÷ invitados (0 a 1). `null` sin invitados. */
    readonly tasa: number | null;
    /** Personas distintas con algún movimiento (en el tramo, si hay). */
    readonly activos: number;
    readonly porForma: readonly { readonly forma: FormaDeEntrar; readonly total: number }[];
    readonly porRegistrador: readonly { readonly nombre: string; readonly total: number }[] | null;
    readonly franjas: readonly FranjaReporte[] | null;
    readonly retencion: {
      readonly primeraHora: number;
      readonly ultimaHora: number;
      readonly apertura: { readonly titulo: string; readonly participantes: number } | null;
      readonly cierre: { readonly titulo: string; readonly participantes: number } | null;
    } | null;
  };
  readonly participacion: {
    readonly participaciones: number;
    readonly conReto: number;
    readonly conCanje: number;
    readonly porReto: readonly RetoReporte[];
    readonly porLugar: readonly { readonly nombre: string; readonly participaciones: number }[];
    readonly porSponsor: readonly { readonly nombre: string; readonly participaciones: number }[];
    readonly fotos: {
      readonly enviadas: number;
      readonly aprobadas: number;
      readonly rechazadas: number;
      readonly conAutorizacion: number;
    };
    readonly porGrupo:
      | readonly {
          readonly nombre: string;
          readonly presentes: number;
          readonly participaciones: number;
        }[]
      | null;
  };
  readonly puntos: {
    readonly ganados: number;
    readonly canjeados: number;
    readonly ajustados: number;
    readonly vencidos: number;
    readonly ajustes: readonly { readonly categoria: string; readonly total: number }[];
    readonly anulaciones: number;
  };
  readonly premios: {
    readonly entregados: number;
    readonly canjes: number;
    readonly gratuitos: number;
    readonly porPremio: readonly {
      readonly nombre: string;
      readonly entregados: number;
      readonly anulados: number;
      readonly sobrante: number;
    }[];
  };
}

/** La tarjeta de Stellar: se lee en el momento, porque el cierre en la red puede llegar después. */
export interface StellarReporte {
  readonly red: 'local' | 'testnet';
  readonly contratoId: string | null;
  readonly enlaceContrato: string | null;
  readonly estado: 'registrado' | 'pendiente';
  readonly lotes: readonly {
    readonly numero: number;
    readonly txHash: string | null;
    readonly enlace: string | null;
    readonly confirmadoAt: string | null;
  }[];
  readonly huellaFinal: string | null;
  readonly cerradoAt: string | null;
  readonly enRedHasta: string | null;
  readonly evidenciaSha256: string | null;
}

export interface Reporte {
  readonly datos: DatosReporte;
  readonly stellar: StellarReporte;
}

/** `GET /eventos/:eventoId/reporte`: el reporte y cómo se comparte. */
export interface ReportePanel extends Reporte {
  readonly publico: boolean;
  /** El enlace solo se conoce al crearlo o cambiarlo: después no se puede volver a mostrar. */
  readonly enlacePublico: string | null;
  readonly compartible: boolean;
}

/**
 * Lo que ve cualquiera con el enlace (§5): sin los nombres de los registradores.
 */
export function toReportePublico(datos: DatosReporte): DatosReporte {
  const registradores = datos.asistencia.porRegistrador;
  return {
    ...datos,
    asistencia: {
      ...datos.asistencia,
      porRegistrador: registradores
        ? registradores.map((r, i) => ({ nombre: `Registrador ${i + 1}`, total: r.total }))
        : null,
    },
  };
}

/** Si el tramo no sirve, el código del error (`null` si sirve). */
export function validateTramo(tramo: TramoReporte, limites: TramoReporte): 'VALIDACION' | null {
  const desde = Date.parse(tramo.desde);
  const hasta = Date.parse(tramo.hasta);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return 'VALIDACION';
  const paso = PASO_TRAMO_MIN * 60_000;
  if (desde % paso !== 0 || hasta % paso !== 0) return 'VALIDACION';
  if (desde < Date.parse(limites.desde) || hasta > Date.parse(limites.hasta)) return 'VALIDACION';
  return null;
}

/** Redondea hacia abajo (o arriba) a los 15 minutos. */
export function roundTramo(fecha: Date, hacia: 'abajo' | 'arriba'): Date {
  const paso = PASO_TRAMO_MIN * 60_000;
  const t = fecha.getTime();
  return new Date(hacia === 'abajo' ? Math.floor(t / paso) * paso : Math.ceil(t / paso) * paso);
}

function toCeldaCsv(valor: string | number): string {
  const texto = String(valor);
  // Una celda que empieza con = + - @ se abre como fórmula en Excel: va con un apóstrofo.
  const seguro = /^[=+\-@]/.test(texto) && typeof valor === 'string' ? `'${texto}` : texto;
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/**
 * El CSV del reporte (§8): UTF-8 con BOM, formato largo `seccion,indicador,detalle,valor`. Lleva lo
 * mismo que el reporte privado.
 */
export function buildCsvReporte(datos: DatosReporte, stellar: StellarReporte | null): string {
  const filas: (string | number)[][] = [['seccion', 'indicador', 'detalle', 'valor']];
  const fila = (seccion: string, indicador: string, detalle: string, valor: string | number) =>
    filas.push([seccion, indicador, detalle, valor]);
  fila('evento', 'nombre', '', datos.evento.nombre);
  fila('evento', 'organizacion', '', datos.evento.organizacion);
  fila('evento', 'inicio', '', datos.evento.inicioAt);
  fila('evento', 'fin', '', datos.evento.finAt);
  fila(
    'evento',
    'tramo',
    '',
    datos.tramo ? `${datos.tramo.desde} a ${datos.tramo.hasta}` : 'completo',
  );
  if (datos.soloTotales) fila('evento', 'solo_totales', '', 'si');
  const a = datos.asistencia;
  fila('asistencia', 'invitados', '', a.invitados);
  fila('asistencia', 'presentes', '', a.presentes);
  fila('asistencia', 'presentes_de_lista', '', a.presentesDeLista);
  fila('asistencia', 'tasa', '', a.tasa === null ? '' : a.tasa.toFixed(4));
  fila('asistencia', 'activos', '', a.activos);
  for (const f of a.porForma) fila('asistencia', 'por_forma', FORMAS_DE_ENTRAR[f.forma], f.total);
  for (const r of a.porRegistrador ?? []) fila('asistencia', 'por_registrador', r.nombre, r.total);
  for (const f of a.franjas ?? []) {
    fila('franjas', 'check_ins', f.hora, f.checkIns);
    fila('franjas', 'activos', f.hora, f.activos);
  }
  if (a.retencion) {
    fila('retencion', 'activos_primera_hora', '', a.retencion.primeraHora);
    fila('retencion', 'activos_ultima_hora', '', a.retencion.ultimaHora);
    if (a.retencion.apertura) {
      fila(
        'retencion',
        'apertura',
        a.retencion.apertura.titulo,
        a.retencion.apertura.participantes,
      );
    }
    if (a.retencion.cierre) {
      fila('retencion', 'cierre', a.retencion.cierre.titulo, a.retencion.cierre.participantes);
    }
  }
  const p = datos.participacion;
  fila('participacion', 'participaciones', '', p.participaciones);
  fila('participacion', 'con_reto', '', p.conReto);
  fila('participacion', 'con_canje', '', p.conCanje);
  for (const r of p.porReto) {
    fila('retos', 'participaciones', r.nombre, r.participaciones);
    fila('retos', 'tope', r.nombre, r.tope);
  }
  for (const l of p.porLugar) fila('lugares', 'participaciones', l.nombre, l.participaciones);
  for (const s of p.porSponsor) fila('sponsors', 'participaciones', s.nombre, s.participaciones);
  fila('fotos', 'enviadas', '', p.fotos.enviadas);
  fila('fotos', 'aprobadas', '', p.fotos.aprobadas);
  fila('fotos', 'rechazadas', '', p.fotos.rechazadas);
  fila('fotos', 'con_autorizacion', '', p.fotos.conAutorizacion);
  for (const g of p.porGrupo ?? []) {
    fila('grupos', 'presentes', g.nombre, g.presentes);
    fila('grupos', 'participaciones', g.nombre, g.participaciones);
  }
  const pt = datos.puntos;
  fila('puntos', 'ganados', '', pt.ganados);
  fila('puntos', 'canjeados', '', pt.canjeados);
  fila('puntos', 'ajustados', '', pt.ajustados);
  fila('puntos', 'vencidos', '', pt.vencidos);
  for (const aj of pt.ajustes) fila('puntos', 'ajustes', aj.categoria, aj.total);
  fila('puntos', 'anulaciones', '', pt.anulaciones);
  const pr = datos.premios;
  fila('premios', 'canjes', '', pr.canjes);
  fila('premios', 'gratuitos', '', pr.gratuitos);
  fila('premios', 'entregados', '', pr.entregados);
  for (const x of pr.porPremio) {
    fila('premios', 'entregados', x.nombre, x.entregados);
    fila('premios', 'anulados', x.nombre, x.anulados);
    fila('premios', 'sobrante', x.nombre, x.sobrante);
  }
  if (stellar) {
    fila('stellar', 'red', '', stellar.red);
    fila('stellar', 'estado', '', stellar.estado);
    fila('stellar', 'contrato', '', stellar.contratoId ?? '');
    fila('stellar', 'huella_final', '', stellar.huellaFinal ?? '');
    fila('stellar', 'evidencia_sha256', '', stellar.evidenciaSha256 ?? '');
    for (const l of stellar.lotes) fila('stellar', 'lote', String(l.numero), l.txHash ?? '');
  }
  return '﻿' + filas.map((f) => f.map(toCeldaCsv).join(',')).join('\r\n') + '\r\n';
}
