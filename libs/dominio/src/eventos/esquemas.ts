import { z } from 'zod';

/**
 * Datos del evento y su contenido (HU-206). Los usan el API (valida) y el panel (arma los
 * formularios con los mismos esquemas).
 */
export const SECCIONES_PUBLICAS = [
  'descripcion',
  'fecha',
  'lugar',
  'agenda',
  'sponsors',
  'preguntas',
  'retos',
  'catalogo',
  'contacto',
] as const;
export type SeccionPublica = (typeof SECCIONES_PUBLICAS)[number];

/** Las que vienen marcadas al crear el evento (Modelo §3). El wifi nunca es público. */
export const SECCIONES_PUBLICAS_POR_DEFECTO: readonly SeccionPublica[] = [
  'descripcion',
  'fecha',
  'lugar',
  'agenda',
  'sponsors',
  'preguntas',
];

export const NOMBRES_SECCION: Readonly<Record<SeccionPublica, string>> = {
  descripcion: 'Descripción',
  fecha: 'Fecha y hora',
  lugar: 'Lugar y mapa',
  agenda: 'Agenda',
  sponsors: 'Sponsors',
  preguntas: 'Preguntas frecuentes',
  retos: 'Retos',
  catalogo: 'Catálogo de premios',
  contacto: 'Contacto',
};

export const VISIBILIDADES = ['privado', 'solo_enlace', 'publico'] as const;

const fecha = z.iso.datetime({ offset: true });
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((t) => (t.length === 0 ? null : t))
    .nullable();
const uuidONulo = z.uuid().nullable();

/** `PATCH /eventos/:eventoId`: cualquiera de los campos (HU-206 §1). */
export const esquemaEditarEvento = z
  .object({
    nombre: z.string().trim().min(3).max(120),
    descripcion: textoOpcional(4_000),
    inicioAt: fecha,
    finAt: fecha,
    zonaHoraria: z.string().min(3).max(60),
    logoArchivoId: uuidONulo,
    portadaArchivoId: uuidONulo,
    planoArchivoId: uuidONulo,
    nombrePuntos: z.string().trim().min(2).max(20),
    contacto: textoOpcional(500),
    wifi: textoOpcional(200),
    visibilidad: z.enum(VISIBILIDADES),
    seccionesPublicas: z.array(z.enum(SECCIONES_PUBLICAS)).max(SECCIONES_PUBLICAS.length),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Solo minúsculas, números y guiones.' })
      .min(3)
      .max(60),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { error: 'Indica qué cambiar.' });

export const TIPOS_LUGAR = ['sala', 'stand', 'mesa', 'servicio'] as const;
export const NOMBRES_TIPO_LUGAR: Readonly<Record<(typeof TIPOS_LUGAR)[number], string>> = {
  sala: 'Sala',
  stand: 'Stand',
  mesa: 'Mesa de canje',
  servicio: 'Servicio',
};

/** Contenido del evento (HU-206 §2). `PATCH` acepta cualquiera de los campos. */
export const ESQUEMAS_CONTENIDO = {
  lugares: z.object({
    tipo: z.enum(TIPOS_LUGAR),
    nombre: z.string().trim().min(2).max(80),
    numeroMapa: z.number().int().min(1).max(99).nullable().default(null),
    descripcion: textoOpcional(300).default(null),
  }),
  actividades: z.object({
    titulo: z.string().trim().min(3).max(120),
    inicioAt: fecha,
    finAt: fecha,
    lugarId: uuidONulo.default(null),
    expositor: textoOpcional(120).default(null),
    sponsorId: uuidONulo.default(null),
    retoId: uuidONulo.default(null),
    descripcion: textoOpcional(1_000).default(null),
  }),
  sponsors: z.object({
    nombre: z.string().trim().min(2).max(80),
    logoArchivoId: uuidONulo.default(null),
    descripcion: textoOpcional(500).default(null),
    enlace: z
      .string()
      .trim()
      .max(300)
      .refine((e) => e === '' || /^https:\/\/[^\s]+$/.test(e), {
        error: 'El enlace tiene que empezar con https://',
      })
      .transform((e) => (e === '' ? null : e))
      .nullable()
      .default(null),
    lugarId: uuidONulo.default(null),
  }),
  preguntas: z.object({
    pregunta: z.string().trim().min(3).max(200),
    respuesta: z.string().trim().min(1).max(2_000),
  }),
} as const;

export type RecursoContenido = keyof typeof ESQUEMAS_CONTENIDO;
export const RECURSOS_CONTENIDO = Object.keys(ESQUEMAS_CONTENIDO) as RecursoContenido[];

export const esquemaOrden = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
