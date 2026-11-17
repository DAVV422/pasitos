import * as z from 'zod';

/**
 * Entradas de `/auth` (HU-201). Las usan el API (valida) y el panel (arma los formularios).
 * El largo de la contraseña cuenta caracteres, no bytes; las reglas de filtradas y comunes las
 * revisa solo el servidor.
 */
export const PASSWORD_LARGO_MIN = 8;
export const PASSWORD_LARGO_MAX = 128;

export const esquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Escribe un correo válido.' }));

export const esquemaPasswordNueva = z
  .string()
  .refine((p) => [...p].length >= PASSWORD_LARGO_MIN, {
    error: `Usa al menos ${PASSWORD_LARGO_MIN} caracteres.`,
  })
  .refine((p) => [...p].length <= PASSWORD_LARGO_MAX, {
    error: `Usa como máximo ${PASSWORD_LARGO_MAX} caracteres.`,
  });

export const esquemaLogin = z.object({
  email: esquemaEmail,
  password: z
    .string()
    .min(1)
    .max(PASSWORD_LARGO_MAX * 4),
});

export const esquemaCodigoTotp = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: 'El código tiene 6 números.' }),
});

export const APPS_EQUIPO = ['admin', 'plataforma'] as const;
export type AppEquipo = (typeof APPS_EQUIPO)[number];

export const esquemaOlvide = z.object({
  email: esquemaEmail,
  /** A qué app lleva el enlace del correo. */
  app: z.enum(APPS_EQUIPO).default('admin'),
});

export const esquemaRestablecer = z.object({
  token: z.string().min(20).max(200),
  password: esquemaPasswordNueva,
});

export const esquemaCambiarPassword = z.object({
  actual: z
    .string()
    .min(1)
    .max(PASSWORD_LARGO_MAX * 4),
  nueva: esquemaPasswordNueva,
});

export const esquemaNombrePasskey = z.object({
  nombre: z.string().trim().min(1).max(50),
});

/** Por qué se rechazó una contraseña (`meta.motivo` de PASSWORD_INSEGURA). */
export type MotivoPasswordInsegura = 'corta' | 'larga' | 'comun' | 'filtrada';

export const MENSAJES_PASSWORD_INSEGURA: Readonly<Record<MotivoPasswordInsegura, string>> = {
  corta: `Usa al menos ${PASSWORD_LARGO_MIN} caracteres.`,
  larga: `Usa como máximo ${PASSWORD_LARGO_MAX} caracteres.`,
  comun:
    'Es una de las contraseñas más usadas. Elige otra, por ejemplo una frase de varias palabras.',
  filtrada:
    'Esta contraseña apareció en filtraciones de otros sitios. Elige una que no uses en ningún otro lado.',
};
