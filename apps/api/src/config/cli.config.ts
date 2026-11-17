import * as z from 'zod';

/**
 * Variables de los comandos de soporte del API (`pnpm plataforma`). Usan pasitos_sistema
 * porque actúan sobre cualquier organización, como la consola de plataforma.
 */
const esquemaCli = z.object({
  DATABASE_URL_SISTEMA: z.string().url(),
});

export type CliConfig = z.infer<typeof esquemaCli>;

export function loadCliConfig(entorno: NodeJS.ProcessEnv = process.env): CliConfig {
  const resultado = esquemaCli.safeParse(entorno);
  if (!resultado.success) {
    throw new Error('Configuración inválida: falta DATABASE_URL_SISTEMA');
  }
  return resultado.data;
}
