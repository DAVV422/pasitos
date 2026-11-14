/**
 * Aplica las migraciones pendientes con el rol pasitos_owner (T-003 §2).
 * Uso: `pnpm db:migrar` (lee DATABASE_URL_OWNER).
 */
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createConexion } from '../cliente';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL_OWNER'];
  if (!url) {
    throw new Error('Falta DATABASE_URL_OWNER');
  }
  const carpeta = process.env['MIGRACIONES_DIR'] ?? resolve(process.cwd(), 'libs/db/migraciones');
  const { db, pool } = createConexion(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: carpeta });
    process.stdout.write('Migraciones aplicadas.\n');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error al migrar: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
