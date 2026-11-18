import * as z from 'zod';
import { TIPOS_MOTIVO_REVINCULAR } from '../acceso/motivos';

/** La puerta (HU-301): escanear *Mi entrada*, marcar presente y deshacer. */
export const esquemaEscanearEntrada = z.object({ qr: z.string().trim().min(1).max(200) });

export const esquemaCheckIn = z.object({ metodo: z.enum(['escaneo_entrada', 'busqueda']) });

/** HU-302 y HU-304: con un celular activo, cambiarlo pide motivo (con `otro`, el texto). */
export const esquemaGenerarAcceso = z.object({
  motivo: z
    .object({
      tipo: z.enum(TIPOS_MOTIVO_REVINCULAR),
      texto: z.string().trim().max(300).optional(),
      alertaId: z.uuid().optional(),
    })
    .refine((m) => m.tipo !== 'otro' || (m.texto?.length ?? 0) >= 5, {
      error: 'Cuenta el motivo (al menos 5 letras).',
      path: ['texto'],
    })
    .optional(),
});

/** HU-303: registrar a alguien que no estaba en la lista. El carnet llega con HU-320 y HU-321. */
export const esquemaRegistroPuerta = z.object({
  nombre: z.string().trim().min(2, { error: 'Escribe el nombre.' }).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .transform((valor) => (valor === '' ? undefined : valor))
    .pipe(z.email({ error: 'Revisa el correo.' }).optional())
    .optional(),
  confirmarDuplicado: z.boolean().optional(),
});

/** HU-305: atender y resolver un *No fui yo*. */
export const esquemaListarAlertas = z.object({
  tipo: z.string().max(20).optional(),
  estado: z.enum(['abierta', 'atendiendo', 'derivada', 'resuelta', 'descartada']).optional(),
});

export const esquemaResolverAlerta = z
  .object({
    // HU-318: *revisada* ("Lo revisé") para las alertas A1–A11, también con nota.
    resolucion: z.enum(['revincular', 'descartar', 'derivar', 'revisada']),
    nota: z.string().trim().max(500).optional(),
  })
  .refine(
    (r) =>
      (r.resolucion !== 'descartar' && r.resolucion !== 'revisada') || (r.nota?.length ?? 0) >= 5,
    { error: 'Cuenta qué revisaste (al menos 5 letras).', path: ['nota'] },
  );

export const esquemaAnularCheckIn = z.object({
  motivo: z.string().trim().min(5, { error: 'Escribe el motivo (al menos 5 letras).' }).max(300),
});
