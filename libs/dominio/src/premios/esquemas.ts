import * as z from 'zod';

/** Catálogo de canje (HU-208 §1). Lo usan el API y el panel. */
export const esquemaPremio = z.object({
  nombre: z.string().trim().min(3).max(80),
  descripcion: z
    .string()
    .trim()
    .max(300)
    .transform((t) => (t.length === 0 ? null : t))
    .nullable()
    .default(null),
  imagenArchivoId: z.uuid().nullable().default(null),
  // HU-325: 0 solo con grupo (un souvenir); lo revisa el servicio al combinar los cambios.
  puntos: z.number().int().min(0).max(100_000),
  stockTotal: z.number().int().min(0).max(100_000),
  maxPorPersona: z.number().int().min(1).max(100).nullable().default(null),
  grupoId: z.uuid().nullable().default(null),
  // HU-321: la mesa pide el carnet para entregarlo.
  requiereCi: z.boolean().default(false),
});

export type DatosPremio = z.infer<typeof esquemaPremio>;

/** "Quedan pocos": menos del 10 % del total o menos de 5. */
export function isPocosDisponibles(disponible: number, total: number): boolean {
  return disponible > 0 && (disponible < 5 || disponible < total * 0.1);
}

/** HU-316: el cobro que arma la mesa. */
export const esquemaCobro = z.object({
  items: z
    .array(z.object({ premioId: z.uuid(), cantidad: z.number().int().min(1).max(20) }))
    .min(1)
    .max(20)
    .refine((items) => new Set(items.map((i) => i.premioId)).size === items.length, {
      error: 'Cada premio va una sola vez.',
    }),
});

/** HU-317: ajustar puntos, otorgar un reto y anular un canje. */
export const esquemaAjuste = z.object({
  puntos: z
    .number()
    .int()
    .refine((p) => p !== 0, { error: 'Los puntos no pueden ser 0.' }),
  motivo: z
    .object({
      tipo: z.enum(['falla_qr', 'compensacion', 'correccion', 'otro']),
      texto: z.string().trim().max(300).optional(),
    })
    .refine((m) => m.tipo !== 'otro' || (m.texto?.length ?? 0) >= 5, {
      error: 'Cuenta el motivo (al menos 5 letras).',
      path: ['texto'],
    }),
});

export const esquemaOtorgamiento = z.object({
  asistentes: z.array(z.string().trim().min(1).max(20)).min(1).max(200),
  motivo: z.string().trim().max(300).optional(),
});

export const esquemaAnularCanje = z.object({
  motivo: z.string().trim().min(5, { error: 'Escribe el motivo (al menos 5 letras).' }).max(300),
});

export const esquemaListarAjustes = z.object({
  tipo: z.enum(['ajuste', 'otorgado', 'anulacion']).optional(),
  autor: z.uuid().optional(),
});
