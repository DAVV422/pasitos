import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

/** El reporte del evento cerrado (HU-402). El enlace público va en `PublicoModule`. */
@Module({
  imports: [AuthModule],
  controllers: [ReportesController],
  providers: [
    {
      provide: ReportesService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new ReportesService(db.db, reloj, {
          red: config.STELLAR_RED,
          publicUrl: config.PUBLIC_URL,
          llaveDatos: config.LLAVE_CIFRADO_DATOS,
        }),
    },
  ],
})
export class ReportesModule {}
