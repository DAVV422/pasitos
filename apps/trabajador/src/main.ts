import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Trabajador (aplicación NestJS sin HTTP).
 * Procesará las colas de pg-boss: sellador (HU-103), correos (T-007), borrado a los 30 días (HU-409)
 * y reportes (HU-402). En la fase 0 solo arranca y termina limpio.
 */
@Module({})
class TrabajadorModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(TrabajadorModule);
  app.enableShutdownHooks();
  const logger = new Logger('Trabajador');
  logger.log('Trabajador iniciado. Sin trabajos registrados todavía.');

  const terminar = async (senal: string) => {
    logger.log(`Recibida ${senal}: cerrando.`);
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void terminar('SIGTERM'));
  process.once('SIGINT', () => void terminar('SIGINT'));
}

void bootstrap();
