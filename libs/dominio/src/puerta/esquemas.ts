import * as z from 'zod';

/** La puerta (HU-301): escanear *Mi entrada*, marcar presente y deshacer. */
export const esquemaEscanearEntrada = z.object({ qr: z.string().trim().min(1).max(200) });

export const esquemaCheckIn = z.object({ metodo: z.enum(['escaneo_entrada', 'busqueda']) });

export const esquemaAnularCheckIn = z.object({
  motivo: z.string().trim().min(5, { error: 'Escribe el motivo (al menos 5 letras).' }).max(300),
});
