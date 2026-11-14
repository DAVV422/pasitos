/**
 * Evento de prueba con movimientos para el Hito A (HU-101 §6). Usa el rol pasitos_sistema.
 *
 *   pnpm semilla:movimientos [--asistentes 50] [--minutos 30] [--evento-prueba]
 *
 * En producción solo corre con --evento-prueba (el evento siempre es de tipo `prueba`).
 */
import { parseArgs } from 'node:util';
import { createConexion } from '@pasitos/db';
import { seedMovimientosPrueba } from '../semillas/movimientos-prueba';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      asistentes: { type: 'string', default: '50' },
      minutos: { type: 'string', default: '0' },
      'evento-prueba': { type: 'boolean', default: false },
    },
  });
  if (process.env['NODE_ENV'] === 'production' && !values['evento-prueba']) {
    throw new Error('En producción, pasa --evento-prueba para confirmar');
  }
  const cantidad = Number(values.asistentes);
  const minutos = Number(values.minutos);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000) {
    throw new Error('--asistentes tiene que ser un entero entre 1 y 5000');
  }
  if (!Number.isFinite(minutos) || minutos < 0) {
    throw new Error('--minutos tiene que ser 0 o más');
  }
  const url = process.env['DATABASE_URL_SISTEMA'];
  if (!url) {
    throw new Error('Falta DATABASE_URL_SISTEMA');
  }

  const { db, pool } = createConexion(url, { max: 2 });
  try {
    let ultimoAviso = 0;
    const resultado = await seedMovimientosPrueba(db, {
      asistentes: cantidad,
      minutos,
      alAvanzar: (hechos, total) => {
        const ahora = Date.now();
        if (ahora - ultimoAviso > 5_000 || hechos === total) {
          ultimoAviso = ahora;
          process.stdout.write(`  ${hechos}/${total} operaciones\n`);
        }
      },
    });
    process.stdout.write(
      `Evento "${resultado.slug}": ${resultado.movimientos} movimientos, ` +
        `${resultado.rechazados} reclamos rechazados por topes o veces por persona.\n`,
    );
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
