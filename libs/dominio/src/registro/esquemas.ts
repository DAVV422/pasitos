import * as z from 'zod';
import { esquemaDeviceId, esquemaSenales } from '../acceso/esquemas';
import { esquemaLlavePublica } from '../terminales/esquemas';
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

/**
 * El correo del autorregistro (D60): opcional y sin validar el dominio ni que no se repita. Solo
 * un formato mínimo `algo@algo` de hasta 254 caracteres.
 */
const correoLibre = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+$/, { error: 'Escribe un correo como nombre@dominio.' });

/** El carnet tal como lo escribe la persona: texto libre de hasta 20 caracteres (D60). */
const carnetLibre = z.string().trim().min(1).max(20);

const nombrePersona = z.string().trim().min(2).max(80);

/** Lo vacío cuenta como «sin dato». */
function vacioANulo(valor: unknown): unknown {
  return typeof valor === 'string' && valor.trim() === '' ? null : valor;
}

/** `POST /app/registro` (HU-320 §2), con el permiso `px_registro`. */
export const esquemaAutoregistro = z
  .object({
    nombre: nombrePersona,
    email: z.preprocess(vacioANulo, correoLibre.nullable()).default(null),
    ci: z.preprocess(vacioANulo, carnetLibre.nullable()).default(null),
    deviceId: esquemaDeviceId,
    llavePublica: esquemaLlavePublica,
    senales: esquemaSenales.optional(),
    terminos: z.object({ version: z.string().max(40), privacidad: z.string().max(40) }),
  })
  .strict();
export type DatosAutoregistro = z.infer<typeof esquemaAutoregistro>;

/** *Mis datos* (`PATCH /app/yo`, HU-320 §4). */
export const esquemaMisDatos = z
  .object({
    nombre: nombrePersona,
    email: z.preprocess(vacioANulo, correoLibre.nullable()),
    ci: z.preprocess(vacioANulo, carnetLibre.nullable()),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { error: 'Indica qué cambiar.' });
export type MisDatos = z.infer<typeof esquemaMisDatos>;

/** Buscar a quién verificar (HU-321 §3): por *Mi entrada* o por nombre o código. */
export const esquemaBuscarCarnet = z
  .object({
    qr: z.string().trim().min(1).max(200).optional(),
    q: z.string().trim().min(1).max(120).optional(),
  })
  .refine((d) => !!d.qr !== !!d.q, { error: 'Escanea Mi entrada o busca por nombre o código.' });

/** Verificar; con `ci`, primero se corrige (o se escribe desde el documento). */
export const esquemaVerificarCi = z.object({ ci: carnetLibre.optional() });

export const esquemaRechazarCi = z.object({ nota: z.string().trim().min(3).max(300) });

export const esquemaAnularCi = z.object({ motivo: z.string().trim().min(5).max(300) });
