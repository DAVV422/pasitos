import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PgBoss } from 'pg-boss';
import { startColas } from './colas/colas';
import { buildComposicion } from './composicion';
import { loadTrabajadorConfig } from './config/trabajador.config';

/**
 * Trabajador (aplicación NestJS sin HTTP). Procesa las colas de pg-boss: el sellador y los
 * trabajos del contrato (HU-103) y los correos (T-007a). Después se suman el borrado a los 30 días y reportes.
 */
@Module({})
class TrabajadorModule {}

async function bootstrap(): Promise<void> {
  const config = loadTrabajadorConfig();
  const app = await NestFactory.createApplicationContext(TrabajadorModule);
  app.enableShutdownHooks();
  const logger = new Logger('Trabajador');

  const composicion = buildComposicion(config, {
    alErrorInactivo: (error) =>
      logger.warn({ err: error.message }, 'Se perdió una conexión en reposo con la base'),
  });
  const boss = new PgBoss({ connectionString: config.DATABASE_URL_SISTEMA, schema: 'pgboss' });
  boss.on('error', (error) => logger.error({ err: error.message }, 'Error de pg-boss'));
  await boss.start();
  const stopColas = await startColas({
    boss,
    pool: composicion.conexion.pool,
    db: composicion.conexion.db,
    sellador: composicion.sellador,
    contrato: composicion.contrato,
    costo: composicion.costo,
    envios: composicion.envios,
    apertura: composicion.apertura,
    purga: composicion.purga,
    borrado: composicion.borrado,
    alertasDiferidas: composicion.alertasDiferidas,
    vencerCobros: composicion.vencerCobros,
    operaciones: composicion.operaciones,
  });
  logger.log(
    `Trabajador iniciado. Red de Stellar: ${config.STELLAR_RED}; operador ${composicion.stellar.operador}.`,
  );

  const terminar = async (senal: string) => {
    logger.log(`Recibida ${senal}: cerrando.`);
    stopColas();
    await boss.stop({ graceful: true, timeout: 30_000 });
    await composicion.conexion.pool.end();
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void terminar('SIGTERM'));
  process.once('SIGINT', () => void terminar('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  new Logger('Trabajador').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
