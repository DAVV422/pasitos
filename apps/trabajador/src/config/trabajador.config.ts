import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Variables de entorno del trabajador, validadas al arrancar (Backend §6, HU-103 §1).
 * La llave del operador se lee de un archivo; nunca va en una variable de entorno.
 */
const esquemaConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL_SISTEMA: z.string().url(),
  STELLAR_RED: z
    .string()
    .refine(
      (red) => red !== 'mainnet',
      'El piloto se ancla en testnet: mainnet no se permite (D50)',
    )
    .pipe(z.enum(['local', 'testnet'])),
  STELLAR_RPC_URL: z.string().url(),
  STELLAR_WASM_HASH: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  STELLAR_OPERADOR_LLAVE_ARCHIVO: z.string().min(1),
  STELLAR_ADMIN_DIRECCION: z.string().regex(/^G[A-Z2-7]{55}$/),
  ANCLAJE_INTERVALO_MIN: z.coerce
    .number()
    .refine(
      (valor) => [1, 2, 5, 10, 15, 30].includes(valor),
      'Valores permitidos: 1, 2, 5, 10, 15, 30',
    )
    .default(5),
  ANCLAJE_LOTE_MAX: z.coerce.number().int().min(1).max(50_000).default(10_000),
  // HU-104 §2: arriba de esto un anchor no se envía. 1 000 000 stroops = 0,1 XLM (medido: 0,0006 a 0,009).
  STELLAR_COMISION_MAX_STROOPS: z.coerce.bigint().positive().default(1_000_000n),
  // Para crear el contrato, sumar retos y registrar pantallas, que crean datos y pagan rent
  // (medido: 0,03 a 0,4 XLM). El cierre no tiene tope: se envía igual y alerta.
  STELLAR_COMISION_MAX_PREPARACION_STROOPS: z.coerce.bigint().positive().default(10_000_000n),
  // HU-104 §3: vacío = sin alerta de presupuesto.
  STELLAR_PRESUPUESTO_MENSUAL_STROOPS: z.coerce
    .bigint()
    .positive()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Volumen de archivos (Infraestructura §3). Aquí va publicos/<organización>/<evento>/evidencia-stellar.json.
  ARCHIVOS_DIR: z.string().min(1).default('.archivos'),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  SENTRY_ENVIRONMENT: z.string().default('desarrollo'),
});

export type TrabajadorConfig = z.infer<typeof esquemaConfig>;

export function loadTrabajadorConfig(entorno: NodeJS.ProcessEnv = process.env): TrabajadorConfig {
  const resultado = esquemaConfig.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `${problema.path.join('.')}: ${problema.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${problemas}`);
  }
  return resultado.data;
}

/** Lee la llave secreta del operador. Solo vive en memoria y nunca se loguea. */
export function readLlaveOperador(archivo: string): string {
  const llave = readFileSync(archivo, 'utf-8').trim();
  if (!/^S[A-Z2-7]{55}$/.test(llave)) {
    throw new Error(
      'El archivo de la llave del operador no tiene una llave secreta de Stellar válida',
    );
  }
  return llave;
}
