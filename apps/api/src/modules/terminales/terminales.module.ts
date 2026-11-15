import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { PROVEEDOR_CONEXION } from './conexion.service';
import { ConexionController, TerminalesController } from './terminales.controller';
import { TerminalesService } from './terminales.service';

/** Pantallas y mesas (HU-209). */
@Module({
  imports: [AuthModule],
  controllers: [TerminalesController, ConexionController],
  providers: [
    PROVEEDOR_CONEXION,
    {
      provide: TerminalesService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new TerminalesService(db.db, reloj, config.PUBLIC_URL),
    },
  ],
})
export class TerminalesModule {}
