import * as z from 'zod';

/**
 * `evidencia-stellar.json` (HU-105 §2, D50): el estado del contrato y todas las transacciones que entraron,
 * con el XDR tal como lo devolvió el RPC. Si testnet se reinicia, con esto se puede comprobar lo anclado.
 * Sin datos personales: solo lo que ya es público en la red. Bytes en hex; i128 como texto.
 */
const hex = (largo?: number) =>
  z.string().regex(largo ? new RegExp(`^[0-9a-f]{${largo}}$`) : /^[0-9a-f]*$/);

const esquemaTransaccion = z.object({
  operacion: z.string(),
  lote: z.number().int().positive().optional(),
  txHash: hex(64),
  ledger: z.number().int(),
  fecha: z.string(),
  comisionStroops: z.number().int(),
  envelopeXdr: z.string(),
  resultXdr: z.string(),
  resultMetaXdr: z.string(),
});

export const esquemaEvidencia = z.object({
  version: z.literal(1),
  red: z.enum(['local', 'testnet']),
  redPassphrase: z.string(),
  contrato: z.string(),
  wasmHash: z.string(),
  versionContrato: z.number().int(),
  generadoAt: z.string(),
  estado: z.object({
    evento: z.object({ idHash: hex(64), inicio: z.number(), fin: z.number() }),
    retos: z.record(z.string(), z.object({ tope: z.number(), entregados: z.number() })),
    pantallas: z.record(z.string(), z.object({ llavePublica: hex(130), registradaAt: z.number() })),
    ultimo: z.object({ n: z.number().int(), huella: hex(64) }),
    cierre: z
      .object({
        nFinal: z.number().int(),
        huellaFinal: hex(64),
        cerradoAt: z.number(),
        totales: z.object({
          participaciones: z.record(z.string(), z.number()),
          ganados: z.string(),
          canjeados: z.string(),
          ajustados: z.string(),
          vencidos: z.string(),
        }),
      })
      .nullable(),
  }),
  transacciones: z.array(esquemaTransaccion),
  /** Está solo si el RPC ya no tenía alguna transacción (pasó su ventana de historia). */
  incompleta: z.literal(true).optional(),
  faltantes: z.array(z.object({ operacion: z.string(), txHash: hex(64) })).optional(),
});

export type EvidenciaStellar = z.infer<typeof esquemaEvidencia>;
export type TransaccionEvidencia = z.infer<typeof esquemaTransaccion>;

/** Lee y valida una evidencia (para `pnpm stellar:verificar --evidencia`). */
export function parseEvidencia(texto: string): EvidenciaStellar {
  const resultado = esquemaEvidencia.safeParse(JSON.parse(texto));
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    throw new Error(
      `La evidencia no tiene el formato esperado: ${problema?.path.join('.') ?? ''} ${problema?.message ?? ''}`,
    );
  }
  return resultado.data;
}

/** El archivo, siempre igual para el mismo contenido: dos espacios y salto de línea final. */
export function serializeEvidencia(evidencia: EvidenciaStellar): string {
  return `${JSON.stringify(evidencia, null, 2)}\n`;
}
