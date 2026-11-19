import * as z from 'zod';
import { esquemaEmail } from '../auth/esquemas';

/** La lista de invitados (HU-210). La usan el API, el trabajador y el panel. */
export const esquemaNombreAsistente = z
  .string()
  .transform((t) => t.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(2, { error: 'Escribe el nombre.' }).max(120));

const emailONulo = z
  .union([z.literal(''), z.null(), esquemaEmail])
  .transform((e) => (e === '' || e === null ? null : e));

const codigoExterno = z
  .union([z.null(), z.string().trim().max(60)])
  .transform((c) => (c === null || c === '' ? null : c));

export const esquemaAsistente = z.object({
  nombre: esquemaNombreAsistente,
  email: emailONulo.optional(),
  codigoExterno: codigoExterno.optional(),
  confirmarDuplicado: z.boolean().optional(),
});

export const esquemaEditarAsistente = esquemaAsistente
  .partial()
  .refine((d) => d.nombre !== undefined || d.email !== undefined || d.codigoExterno !== undefined, {
    error: 'Indica qué cambiar.',
  });

export const esquemaCancelarAsistente = z.object({
  motivo: z.string().trim().max(300).optional(),
});

export const ESTADOS_ASISTENTE = ['invitado', 'registrado', 'presente', 'cancelado'] as const;
export const ESTADOS_EMAIL = ['sin_correo', 'pendiente', 'en_cola', 'enviado', 'rebotado'] as const;

export const NOMBRES_ESTADO_ASISTENTE: Readonly<
  Record<(typeof ESTADOS_ASISTENTE)[number], string>
> = {
  invitado: 'Invitado',
  registrado: 'Registrado',
  presente: 'Presente',
  cancelado: 'Quitado de la lista',
};

export const NOMBRES_ESTADO_EMAIL: Readonly<Record<(typeof ESTADOS_EMAIL)[number], string>> = {
  sin_correo: 'Sin correo',
  pendiente: 'Sin enviar',
  en_cola: 'En cola',
  enviado: 'Enviado',
  rebotado: 'Rebotó',
};

export const esquemaBuscarAsistentes = z.object({
  q: z.string().trim().max(120).optional(),
  estado: z.enum(ESTADOS_ASISTENTE).optional(),
  emailEstado: z.enum(ESTADOS_EMAIL).optional(),
  // HU-303: los registrados en la puerta; HU-320: los que se registraron con un QR.
  origen: z.enum(['lista', 'csv', 'puerta', 'autoregistro']).optional(),
  qrRegistroId: z.uuid().optional(),
  // HU-325: las personas de un grupo.
  grupoId: z.uuid().optional(),
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const esquemaConfirmarImportacion = z.object({
  incluirPosiblesDuplicadas: z.array(z.number().int().min(2)).max(5_000).default([]),
});

export const esquemaExportar = z.object({ estado: z.enum(ESTADOS_ASISTENTE).optional() });

/** HU-211: sin `asistenteIds`, todos los pendientes. */
export const esquemaEnviarInvitaciones = z.object({
  asistenteIds: z.array(z.uuid()).max(5_000).optional(),
});

/** `?asistenteIds=a,b,c&formato=json|csv`. */
export const esquemaEnlaces = z.object({
  asistenteIds: z
    .string()
    .optional()
    .transform((t) => (t ? t.split(',').filter((id) => id !== '') : undefined))
    .pipe(z.array(z.uuid()).max(5_000).optional()),
  formato: z.enum(['json', 'csv']).default('json'),
});

/** Similitud trigram desde la que un nombre "se parece" a otro de la lista. */
export const SIMILITUD_DUPLICADO = 0.6;
/** Las operaciones de importar vencen en 24 h; el enlace de descarga, en 10 min. */
export const VIGENCIA_OPERACION_MS = 24 * 3_600_000;
export const VIGENCIA_DESCARGA_MS = 10 * 60_000;

/** El código de asistente es exacto: `A-0231`. */
export function isCodigoAsistente(texto: string): boolean {
  return /^A-\d{4,}$/i.test(texto.trim());
}
