import * as z from 'zod';

/** El formulario de contacto de la landing (HU-410 §1). */
export const TIPOS_EVENTO_CONTACTO = {
  conferencia: 'Conferencia o congreso',
  meetup: 'Meetup o comunidad',
  feria: 'Feria o exposición',
  universidad: 'Evento universitario',
  otro: 'Otro',
} as const;
export type TipoEventoContacto = keyof typeof TIPOS_EVENTO_CONTACTO;

export const ASISTENTES_CONTACTO = {
  menos_100: 'Menos de 100',
  '100_300': 'Entre 100 y 300',
  '300_1000': 'Entre 300 y 1.000',
  mas_1000: 'Más de 1.000',
} as const;
export type AsistentesContacto = keyof typeof ASISTENTES_CONTACTO;

export const ESTADOS_CONTACTO = ['nuevo', 'respondido', 'descartado'] as const;
export type EstadoContacto = (typeof ESTADOS_CONTACTO)[number];

/** Se guardan 12 meses (Política de privacidad §7). */
export const MESES_CONTACTO = 12;

const opcional = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional());

/** `POST /publico/contacto`. `sitioWeb` es la trampa para robots: tiene que venir vacío. */
export const esquemaContacto = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre.').max(100),
  email: z.email('Escribe un correo válido.').max(254),
  organizacion: opcional(z.string().trim().max(120)),
  tipoEvento: opcional(z.enum(Object.keys(TIPOS_EVENTO_CONTACTO) as [TipoEventoContacto])),
  asistentesAprox: opcional(z.enum(Object.keys(ASISTENTES_CONTACTO) as [AsistentesContacto])),
  mensaje: z.string().trim().min(10, 'Cuéntanos un poco más (al menos 10 letras).').max(2000),
  aceptaPrivacidad: z.literal(true, 'Acepta la política de privacidad para enviar.'),
  sitioWeb: z.string().max(200).optional(),
  turnstile: z.string().max(4000).optional(),
});
export type DatosContacto = z.infer<typeof esquemaContacto>;

/** `PATCH /plataforma/contactos/:id`. */
export const esquemaActualizarContacto = z
  .object({
    estado: z.enum(ESTADOS_CONTACTO).optional(),
    notaInterna: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => d.estado !== undefined || d.notaInterna !== undefined, {
    error: 'Nada que cambiar.',
  });

export const esquemaListarContactos = z.object({
  estado: z.enum(ESTADOS_CONTACTO).optional(),
  cursor: z.uuid().optional(),
});
