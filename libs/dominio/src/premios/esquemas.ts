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
  puntos: z.number().int().min(1).max(100_000),
  stockTotal: z.number().int().min(0).max(100_000),
  maxPorPersona: z.number().int().min(1).max(100).nullable().default(null),
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
