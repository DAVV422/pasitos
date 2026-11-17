import * as z from 'zod';
import { TIPOS_MOVIMIENTO } from './tipos';

// Los esquemas Zod se arman al cargar el módulo: van por `@pasitos/dominio/esquemas`, no por el índice,
// para no sumar Zod al paquete de las apps que no los usan.

const HEX_32 = /^[0-9a-f]{64}$/;
const HORA_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const entero = z.number().int();
const numeroCorto = z.number().int().min(1);

/** QR firmado por la pantalla: por tiempo (`f`, franja) o de un solo uso (`u`, nonce). */
export const qrPublicoSchema = z.union([
  z.strictObject({ e: entero.min(0), f: entero.min(0), firma: z.string().regex(BASE64URL) }),
  z.strictObject({ e: entero.min(0), u: z.string().min(1), firma: z.string().regex(BASE64URL) }),
]);

/**
 * Lo que se publica y se hashea de cada movimiento (Contrato y sellador §4.1, HU-102 §2).
 * Sin datos personales: `asistente` es el id anónimo del evento. Los campos ausentes no van.
 */
export const movimientoPublicoSchema = z.strictObject({
  n: numeroCorto,
  tipo: z.enum(TIPOS_MOVIMIENTO),
  asistente: z.string().regex(HEX_32),
  puntos: entero,
  reto: numeroCorto.optional(),
  pantalla: numeroCorto.optional(),
  qr: qrPublicoSchema.optional(),
  anula: numeroCorto.optional(),
  autor: z
    .string()
    .regex(/^equipo #\d+$/)
    .optional(),
  motivo: z.string().min(1).optional(),
  hora: z.string().regex(HORA_UTC),
});

export type MovimientoPublico = z.infer<typeof movimientoPublicoSchema>;
