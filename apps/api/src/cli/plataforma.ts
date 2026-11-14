/**
 * Acciones de la consola de plataforma mientras no existe la consola (HU-202). Lo corre una persona de
 * Pasitos; cada acción queda en la bitácora con el mismo servicio que usará la consola.
 *
 *   pnpm plataforma intervalo --evento <slug> --minutos <1|2|5|10|15|30|plataforma> --motivo "…"
 *
 * `--minutos plataforma` vuelve al valor de ANCLAJE_INTERVALO_MIN.
 */
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { AppError, INTERVALOS_ANCLAJE_MIN, type IntervaloAnclajeMin } from '@pasitos/dominio';
import { createConexion, eventos } from '@pasitos/db';
import { loadCliConfig } from '../config/cli.config';
import { EventosPlataformaService } from '../modules/plataforma/eventos-plataforma.service';

const USO = `Uso: pnpm plataforma intervalo --evento <slug> --minutos <${INTERVALOS_ANCLAJE_MIN.join('|')}|plataforma> --motivo "…"`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      evento: { type: 'string' },
      minutos: { type: 'string' },
      motivo: { type: 'string' },
    },
  });
  const motivo = values.motivo?.trim();
  if (positionals[0] !== 'intervalo' || !values.evento || !values.minutos || !motivo) {
    throw new Error(USO);
  }
  const minutos =
    values.minutos === 'plataforma' ? null : (Number(values.minutos) as IntervaloAnclajeMin);

  const conexion = createConexion(loadCliConfig().DATABASE_URL_SISTEMA, { max: 2 });
  try {
    const [evento] = await conexion.db
      .select({ id: eventos.id })
      .from(eventos)
      .where(eq(eventos.slug, values.evento));
    if (!evento) {
      throw new Error(`No existe el evento "${values.evento}"`);
    }
    await new EventosPlataformaService(conexion.db).updateIntervaloAnclaje(
      evento.id,
      minutos,
      { tipo: 'sistema', id: null, nombre: 'Soporte de Pasitos (comando)', rol: null },
      motivo,
    );
    process.stdout.write(
      `Intervalo de anclaje: ${minutos === null ? 'el de la plataforma' : `${minutos} min`}. Vale desde el próximo ciclo del sellador.\n`,
    );
  } finally {
    await conexion.pool.end();
  }
}

main().catch((error: unknown) => {
  const mensaje =
    error instanceof AppError
      ? `${error.code}${error.errors?.[0] ? `: ${error.errors[0].message}` : ''}`
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`Error: ${mensaje}\n`);
  process.exit(1);
});
