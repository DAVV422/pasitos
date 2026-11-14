/**
 * Encola (o corre en el momento) un trabajo de Stellar para un evento (HU-103 §6).
 *
 *   pnpm stellar:trabajo <trabajo> --evento <slug> [--directo]
 *
 * Trabajos: anchor-lote, deploy-contrato, sync-retos, register-pantallas, close-contrato.
 * Sin --directo lo encola y lo procesa el trabajador que esté corriendo; con --directo lo corre este proceso
 * (útil para el Hito A y para soporte). Usa DATABASE_URL_SISTEMA y la configuración de Stellar del .env.
 */
import { parseArgs } from 'node:util';
import { PgBoss } from 'pg-boss';
import {
  runTrabajoStellar,
  sendTrabajoStellar,
  TRABAJOS_STELLAR,
  withCandadoOperador,
  type NombreTrabajoStellar,
} from '../colas/colas';
import { buildComposicion } from '../composicion';
import { loadTrabajadorConfig } from '../config/trabajador.config';
import { SelladorRepository } from '../sellador/sellador.repository';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { evento: { type: 'string' }, directo: { type: 'boolean', default: false } },
  });
  const [nombre] = positionals;
  if (!nombre || !(TRABAJOS_STELLAR as readonly string[]).includes(nombre) || !values.evento) {
    throw new Error(
      `Uso: pnpm stellar:trabajo <${TRABAJOS_STELLAR.join('|')}> --evento <slug> [--directo]`,
    );
  }
  const config = loadTrabajadorConfig();
  const composicion = buildComposicion(config);
  try {
    const eventoId = await new SelladorRepository(composicion.conexion.db).findEventoIdBySlug(
      values.evento,
    );
    if (!eventoId) {
      throw new Error(`No existe el evento "${values.evento}"`);
    }
    const trabajo = nombre as NombreTrabajoStellar;
    if (values.directo) {
      const resultado = await withCandadoOperador(composicion.conexion.pool, () =>
        runTrabajoStellar(trabajo, eventoId, composicion.sellador, composicion.contrato),
      );
      if (resultado === null) {
        throw new Error(
          'Otro proceso tiene el candado del operador (¿está corriendo el trabajador?)',
        );
      }
      process.stdout.write(`${trabajo}: ${String(resultado ?? 'hecho')}\n`);
      return;
    }
    const boss = new PgBoss({ connectionString: config.DATABASE_URL_SISTEMA, schema: 'pgboss' });
    await boss.start();
    try {
      const id = await sendTrabajoStellar(boss, { trabajo, eventoId });
      process.stdout.write(
        id ? `Encolado ${trabajo} (${id}).\n` : `Ya había un ${trabajo} esperando.\n`,
      );
    } finally {
      await boss.stop({ graceful: false });
    }
  } finally {
    await composicion.conexion.pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
