import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createConexion, type ConexionDb } from '@pasitos/db';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';

/**
 * Conexión del API con el rol pasitos_app (con RLS, D47).
 * Las consultas a tablas con RLS pasan siempre por withOrganizacion() (T-003 §3).
 */
@Injectable()
export class DbService implements OnApplicationShutdown {
  readonly conexion: ConexionDb;

  private readonly logger = new Logger(DbService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.conexion = createConexion(config.DATABASE_URL_APP, { max: 20 }, (error) =>
      this.logger.warn({ err: error }, 'Se perdió una conexión en reposo con la base'),
    );
  }

  get db() {
    return this.conexion.db;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.conexion.pool.end();
  }
}

@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
