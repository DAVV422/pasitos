import * as z from 'zod';
import { COLORES_GRUPO } from './grupos';

/** Un grupo (HU-325 §2). */
export const esquemaGrupo = z
  .object({
    nombre: z.string().trim().min(2).max(40),
    color: z.enum(COLORES_GRUPO).default('puntos'),
  })
  .strict();
export type DatosGrupo = z.infer<typeof esquemaGrupo>;

export const esquemaEditarGrupo = z
  .object({ nombre: z.string().trim().min(2).max(40), color: z.enum(COLORES_GRUPO) })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { error: 'Indica qué cambiar.' });

/** Agregar a mano: por código (`A-0231`). */
export const esquemaMiembrosGrupo = z.object({
  asistentes: z.array(z.string().trim().min(1).max(20)).min(1).max(500),
});
