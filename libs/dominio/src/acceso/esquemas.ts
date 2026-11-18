import * as z from 'zod';
import { esquemaLlavePublica } from '../terminales/esquemas';
import { TIPOS_ACCESO } from './tipos';

/** El id aleatorio del navegador (128 bits o más, en base64url). Solo se guarda su hash. */
export const esquemaDeviceId = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

/** Las señales técnicas del navegador (HU-307): se guardan tal cual, con un tamaño acotado. */
export const esquemaSenales = z
  .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine((senales) => Object.keys(senales).length <= 30, { error: 'Demasiadas señales.' });

export const esquemaVincular = z.object({
  tipo: z.enum(TIPOS_ACCESO),
  token: z.string().min(8).max(200),
  llavePublica: esquemaLlavePublica,
  deviceId: esquemaDeviceId,
  senales: esquemaSenales.optional(),
  terminos: z.object({ version: z.string().max(40), privacidad: z.string().max(40) }),
});

export type DatosVincular = z.infer<typeof esquemaVincular>;

/** *No fui yo* (HU-312 §3): sobre qué no reconoce la persona. */
export const esquemaNoFuiYo = z.object({
  sobre: z.enum(['dispositivo', 'intento', 'canje']),
  refId: z.uuid().optional(),
});
