import * as z from 'zod';
import { MUESTRAS_QR_REGISTRO, TIPOS_QR_REGISTRO } from './qr-registro';

const fecha = z.iso.datetime({ offset: true });

const camposEditables = {
  nombre: z.string().trim().min(2).max(60),
  muestra: z.enum(MUESTRAS_QR_REGISTRO),
  usuarioId: z.uuid().nullable(),
  pantallaId: z.uuid().nullable(),
  grupoId: z.uuid().nullable(),
  marcaPresente: z.boolean(),
  tope: z.number().int().min(1).max(100_000).nullable(),
  desde: fecha.nullable(),
  hasta: fecha.nullable(),
};

/**
 * Crear un QR de registro (HU-319 §2). Un fijo siempre es `impreso` y exige `confirmarRiesgo`
 * (lo revisa el servicio, con su código de error).
 */
export const esquemaCrearQrRegistro = z
  .object({
    tipo: z.enum(TIPOS_QR_REGISTRO),
    nombre: camposEditables.nombre,
    muestra: camposEditables.muestra.optional(),
    usuarioId: camposEditables.usuarioId.default(null),
    pantallaId: camposEditables.pantallaId.default(null),
    grupoId: camposEditables.grupoId.default(null),
    marcaPresente: camposEditables.marcaPresente.default(true),
    tope: camposEditables.tope.default(null),
    desde: camposEditables.desde.default(null),
    hasta: camposEditables.hasta.default(null),
    confirmarRiesgo: z.boolean().default(false),
  })
  .strict();
export type CrearQrRegistro = z.infer<typeof esquemaCrearQrRegistro>;

/** Editar: todo menos el tipo. */
export const esquemaEditarQrRegistro = z
  .object(camposEditables)
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { error: 'Indica qué cambiar.' });
export type EditarQrRegistro = z.infer<typeof esquemaEditarQrRegistro>;

export const esquemaInvalidarQrRegistro = z.object({
  motivo: z.string().trim().min(5).max(300),
});

export const esquemaImprimibleQrRegistro = z.object({
  formato: z.enum(['png', 'pdf']).default('png'),
});
