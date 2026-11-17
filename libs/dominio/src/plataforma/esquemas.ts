import * as z from 'zod';
import { esquemaEmail, esquemaPasswordNueva } from '../auth/esquemas';

/** Entradas de la consola de plataforma (HU-202) y de aceptar una invitación (HU-203 §3). */
export const esquemaNombrePersona = z.string().trim().min(2).max(80);

export const esquemaSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Solo minúsculas, números y guiones.' })
  .min(3)
  .max(60);

export const esquemaCrearOrganizacion = z.object({
  nombre: z.string().trim().min(2).max(120),
  slug: esquemaSlug.optional(),
  duenoEmail: esquemaEmail,
  duenoNombre: esquemaNombrePersona,
});

export const esquemaEditarOrganizacion = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    estado: z.enum(['activa', 'suspendida']).optional(),
    motivo: z.string().trim().max(300).optional(),
  })
  .refine((d) => d.nombre !== undefined || d.estado !== undefined, {
    error: 'Indica el nombre o el estado.',
  });

export const esquemaCambiarDueno = z.object({
  email: esquemaEmail,
  nombre: esquemaNombrePersona,
  motivo: z.string().trim().min(5).max(300),
});

export const esquemaEventoPrueba = z
  .object({
    nombre: z.string().trim().min(3).max(120),
    inicioAt: z.iso.datetime({ offset: true }),
    finAt: z.iso.datetime({ offset: true }),
  })
  .refine((d) => new Date(d.finAt) > new Date(d.inicioAt), {
    error: 'El fin tiene que ser después del inicio.',
    path: ['finAt'],
  });

export const ROLES_PLATAFORMA_NOMBRABLES = ['admin', 'soporte'] as const;

export const esquemaInvitarPlataforma = z.object({
  email: esquemaEmail,
  nombre: esquemaNombrePersona,
  rol: z.enum(ROLES_PLATAFORMA_NOMBRABLES),
});

export const esquemaCambiarRolPlataforma = z.object({
  rol: z.enum(ROLES_PLATAFORMA_NOMBRABLES).nullable(),
  motivo: z.string().trim().min(5).max(300),
});

export const esquemaRestablecerSegundoFactor = z.object({
  motivo: z.string().trim().min(5).max(300),
  /** Cómo se comprobó la identidad (*"Videollamada con su CI, 21/11 15:00"*). */
  verificacion: z.string().trim().min(10).max(300),
});

export const esquemaIntervaloAnclaje = z.object({
  intervaloAnclajeMin: z
    .union([z.literal(2), z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
    .nullable(),
  motivo: z.string().trim().min(5).max(300),
});

export const esquemaAceptarInvitacion = z.object({
  nombre: esquemaNombrePersona.optional(),
  password: esquemaPasswordNueva.optional(),
  aceptaTerminos: z.literal(true).optional(),
});

export const NOMBRES_ROL_PLATAFORMA = {
  superadmin: 'Administrador principal',
  admin: 'Administrador',
  soporte: 'Soporte',
} as const;
