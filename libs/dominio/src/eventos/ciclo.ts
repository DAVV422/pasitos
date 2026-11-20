import * as z from 'zod';

/**
 * Ciclo de vida del evento (HU-205 §3, Modelo §11.1). Volver a borrador no existe; cerrar
 * (HU-401) no se deshace.
 */
export const ESTADOS_EVENTO = [
  'borrador',
  'publicado',
  'en_curso',
  'pausado',
  'cerrado',
  'archivado',
] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

export const TRANSICIONES_EVENTO = {
  publicar: { de: ['borrador'], a: 'publicado' },
  abrir: { de: ['publicado'], a: 'en_curso' },
  pausar: { de: ['en_curso'], a: 'pausado' },
  reanudar: { de: ['pausado'], a: 'en_curso' },
  // HU-401: también un evento publicado que nunca se abrió (si no, quedaría publicado para siempre).
  cerrar: { de: ['publicado', 'en_curso', 'pausado'], a: 'cerrado' },
} as const satisfies Record<string, { de: readonly EstadoEvento[]; a: EstadoEvento }>;
export type TransicionEvento = keyof typeof TRANSICIONES_EVENTO;

export function canTransicion(estado: string, transicion: TransicionEvento): boolean {
  return (TRANSICIONES_EVENTO[transicion].de as readonly string[]).includes(estado);
}

/** La palabra que hay que escribir para cerrar (HU-401 §2): sin importar mayúsculas ni espacios. */
export const CONFIRMACION_CIERRE = 'CERRAR';

export function isConfirmacionCierre(texto: string): boolean {
  return texto.trim().toUpperCase() === CONFIRMACION_CIERRE;
}

/** HU-401 §5: el aviso a los asistentes, antes del cierre programado. */
export const AVISO_CIERRE_MIN = 30;
/** HU-401 §5: si nadie lo cerró, se cierra solo a las 24 h del fin, con un correo 2 h antes. */
export const CIERRE_AUTOMATICO_HORAS = 24;
export const AVISO_CIERRE_AUTOMATICO_HORAS = 2;
/** HU-401 §5: el cierre programado, entre ahora + 15 minutos y el fin + 24 h. */
export const CIERRE_PROGRAMADO_MIN_MIN = 15;

/** Cuándo se cierra solo un evento abierto que nadie cerró ni programó. */
export function getCierreAutomatico(finAt: Date): Date {
  return new Date(finAt.getTime() + CIERRE_AUTOMATICO_HORAS * 3_600_000);
}

export const NOMBRES_ESTADO_EVENTO: Readonly<Record<EstadoEvento, string>> = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  en_curso: 'En curso',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
  archivado: 'Archivado',
};

/** Una fila de la lista de chequeo para publicar (HU-205 §2). */
export interface ItemChequeo {
  readonly clave:
    'fechas' | 'retos' | 'retos_con_pantalla' | 'catalogo_con_mesa' | 'retos_en_horario';
  readonly ok: boolean;
  readonly texto: string;
  /** Pantalla del panel que lo resuelve, relativa al evento. */
  readonly enlace: 'configuracion' | 'retos' | 'pantallas' | 'mesas';
}

export interface DatosChequeo {
  readonly inicioAt: Date;
  readonly finAt: Date;
  readonly ahora: Date;
  readonly retos: readonly {
    readonly nombre: string;
    readonly tipo: string;
    readonly activo: boolean;
    /** ¿Hay una pantalla donde se muestra? (por su lugar desde HU-206; antes, alguna del evento). */
    readonly tienePantalla: boolean;
    readonly enHorario: boolean;
  }[];
  readonly premiosActivos: number;
  readonly mesas: number;
}

/** La lista de chequeo. La usan `GET …/lista-de-chequeo` y `publicar`, con la misma función. */
export function buildListaChequeo(datos: DatosChequeo): {
  completa: boolean;
  items: ItemChequeo[];
} {
  const activos = datos.retos.filter((r) => r.activo);
  const items: ItemChequeo[] = [
    {
      clave: 'fechas',
      ok: datos.inicioAt < datos.finAt && datos.finAt > datos.ahora,
      texto: 'Revisa las fechas del evento',
      enlace: 'configuracion',
    },
    {
      clave: 'retos',
      ok: activos.length > 0,
      texto: 'Crea al menos un reto',
      enlace: 'retos',
    },
    ...activos
      .filter((r) => r.tipo === 'qr' && !r.tienePantalla)
      .map((r): ItemChequeo => ({
        clave: 'retos_con_pantalla',
        ok: false,
        texto: `El reto «${r.nombre}» no tiene pantalla`,
        enlace: 'pantallas',
      })),
    ...(datos.premiosActivos > 0 && datos.mesas === 0
      ? [
          {
            clave: 'catalogo_con_mesa',
            ok: false,
            texto: 'Tienes premios pero ninguna mesa de canje',
            enlace: 'mesas',
          } satisfies ItemChequeo,
        ]
      : []),
    ...activos
      .filter((r) => !r.enHorario)
      .map((r): ItemChequeo => ({
        clave: 'retos_en_horario',
        ok: false,
        texto: `El horario del reto «${r.nombre}» queda fuera del evento`,
        enlace: 'retos',
      })),
  ];
  return { completa: items.every((i) => i.ok), items };
}

/** Hasta 7 días por evento (HU-205 §1). */
export const DURACION_MAXIMA_EVENTO_MS = 7 * 24 * 60 * 60 * 1000;

function isZonaHoraria(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es-BO', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export const esquemaCrearEvento = z
  .object({
    nombre: z.string().trim().min(3).max(120),
    inicioAt: z.iso.datetime({ offset: true }),
    finAt: z.iso.datetime({ offset: true }),
    zonaHoraria: z
      .string()
      .default('America/La_Paz')
      .refine(isZonaHoraria, { error: 'Zona horaria desconocida.' }),
  })
  .refine((d) => new Date(d.finAt) > new Date(d.inicioAt), {
    error: 'El fin tiene que ser después del inicio.',
    path: ['finAt'],
  })
  .refine(
    (d) =>
      new Date(d.finAt).getTime() - new Date(d.inicioAt).getTime() <= DURACION_MAXIMA_EVENTO_MS,
    { error: 'Un evento dura como mucho 7 días.', path: ['finAt'] },
  );
