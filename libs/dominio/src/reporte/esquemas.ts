import * as z from 'zod';

/** `GET /eventos/:eventoId/reporte/tramo` y `/reporte/csv?desde&hasta` (HU-402 §3.1). */
export const esquemaTramoReporte = z
  .object({ desde: z.iso.datetime({ offset: true }), hasta: z.iso.datetime({ offset: true }) })
  .refine((t) => Date.parse(t.hasta) > Date.parse(t.desde), {
    message: 'Hasta tiene que ser después de Desde.',
    path: ['hasta'],
  });

/** `PATCH /eventos/:eventoId/reporte` (HU-402 §5). */
export const esquemaCompartirReporte = z.object({
  publico: z.boolean(),
  /** Con `true`, genera un enlace nuevo y el anterior deja de servir. */
  cambiarEnlace: z.boolean().optional(),
});
export type DatosCompartirReporte = z.infer<typeof esquemaCompartirReporte>;
