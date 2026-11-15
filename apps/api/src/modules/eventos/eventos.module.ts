import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';

/** Crear el evento y su ciclo de vida (HU-205). */
@Module({
  imports: [AuthModule],
  controllers: [EventosController],
  providers: [
    {
      provide: EventosService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new EventosService(db.db, reloj, config.STELLAR_RED),
    },
  ],
  exports: [EventosService],
})
export class EventosModule {}
