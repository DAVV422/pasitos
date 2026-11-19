import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { AuthModule } from '../auth/auth.module';
import { CIFRADOR } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { CorreosService } from '@pasitos/correos';
import type { Cifrador } from '@pasitos/db';
import { InvitacionesAsistentesService } from './invitaciones.service';
import { AsistentesService } from './asistentes.service';
import { InvitadosController } from './invitados.controller';
import { OperacionesService } from './operaciones.service';

/** La lista de invitados (HU-210). */
@Module({
  imports: [AuthModule, ArchivosModule],
  controllers: [InvitadosController],
  providers: [
    {
      provide: AsistentesService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new AsistentesService(db.db, reloj),
    },
    {
      provide: InvitacionesAsistentesService,
      inject: [DbService, CorreosService, CIFRADOR, RELOJ, APP_CONFIG],
      useFactory: (
        db: DbService,
        correos: CorreosService,
        cifrador: Cifrador,
        reloj: Reloj,
        config: AppConfig,
      ) => new InvitacionesAsistentesService(db.db, correos, cifrador, reloj, config.PUBLIC_URL),
    },
    {
      provide: OperacionesService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new OperacionesService(db.db, reloj, config.ARCHIVOS_DIR),
    },
  ],
  exports: [AsistentesService, OperacionesService],
})
export class InvitadosModule {}
