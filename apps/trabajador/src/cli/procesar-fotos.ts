/**
 * Procesa una vez las fotos recibidas y las descargas para redes pendientes (HU-322 y HU-324), sin
 * levantar el trabajador entero. Lo usan las pruebas de punta a punta, donde no corre el trabajador.
 *
 *   pnpm fotos:procesar
 */
import { createConexion } from '@pasitos/db';
import { RELOJ_SISTEMA } from '../comun/reloj';
import { loadTrabajadorConfig } from '../config/trabajador.config';
import { ExportarFotosService } from '../fotos/exportar-fotos.service';
import { ProcesarFotosService } from '../fotos/procesar-fotos.service';

async function main(): Promise<void> {
  const config = loadTrabajadorConfig();
  const conexion = createConexion(config.DATABASE_URL_SISTEMA, { max: 2 });
  try {
    const fotos = await new ProcesarFotosService(
      conexion.db,
      config.ARCHIVOS_DIR,
      RELOJ_SISTEMA,
    ).processPendientes();
    const descargas = await new ExportarFotosService(
      conexion.db,
      config.ARCHIVOS_DIR,
      RELOJ_SISTEMA,
    ).processPendientes();
    process.stdout.write(`Fotos procesadas: ${fotos} · descargas armadas: ${descargas}\n`);
  } finally {
    await conexion.pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
