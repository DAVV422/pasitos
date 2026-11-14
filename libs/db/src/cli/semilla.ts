/**
 * Carga una semilla. Usa el rol pasitos_sistema (DATABASE_URL_SISTEMA).
 *
 *   pnpm semilla minima                     # desarrollo y CI
 *   pnpm semilla demo                       # desarrollo y CI (se amplía con cada HU)
 *   pnpm semilla produccion-demo [--reiniciar-en-vivo]
 */
import { createConexion } from '../cliente';
import { seedMinima } from '../semillas/minima';
import { seedProduccionDemo } from '../semillas/produccion-demo';

const SOLO_DESARROLLO = new Set(['minima', 'demo']);

async function main(): Promise<void> {
  const [nombre, ...banderas] = process.argv.slice(2);
  if (!nombre) {
    throw new Error('Indica la semilla: minima, demo o produccion-demo');
  }
  if (SOLO_DESARROLLO.has(nombre) && process.env['NODE_ENV'] === 'production') {
    throw new Error(`La semilla "${nombre}" no se puede cargar en producción`);
  }
  const url = process.env['DATABASE_URL_SISTEMA'];
  if (!url) {
    throw new Error('Falta DATABASE_URL_SISTEMA');
  }

  const { db, pool } = createConexion(url, { max: 1 });
  try {
    switch (nombre) {
      case 'minima':
      case 'demo':
        // En la fase 0, la semilla demo es la mínima; HU-210 le suma los 500 invitados.
        await seedMinima(db);
        break;
      case 'produccion-demo':
        await seedProduccionDemo(db, {
          duenos: (process.env['DEMO_DUENOS'] ?? '')
            .split(',')
            .map((correo) => correo.trim().toLowerCase())
            .filter((correo) => correo.length > 0),
          reiniciarEnVivo: banderas.includes('--reiniciar-en-vivo'),
        });
        break;
      default:
        throw new Error(`Semilla desconocida: ${nombre}`);
    }
    process.stdout.write(`Semilla "${nombre}" cargada.\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error en la semilla: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
