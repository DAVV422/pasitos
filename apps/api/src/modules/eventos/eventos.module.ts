import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { ArchivosService } from '../archivos/archivos.service';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { CierreController } from './cierre.controller';
import { CierreService } from './cierre.service';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';

/** Crear el evento y su ciclo de vida (HU-205), hasta el cierre (HU-401). */
@Module({
  imports: [AuthModule, ArchivosModule],
  controllers: [EventosController, CierreController],
  providers: [
    {
      provide: EventosService,
      inject: [DbService, RELOJ, APP_CONFIG, ArchivosService],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig, archivos: ArchivosService) =>
        new EventosService(db.db, reloj, config.STELLAR_RED, archivos),
    },
    {
      provide: CierreService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new CierreService(db.db, reloj, config.STELLAR_RED),
    },
  ],
  exports: [EventosService],
})
export class EventosModule {}
