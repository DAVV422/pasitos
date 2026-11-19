import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { ArchivosService } from '../archivos/archivos.service';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { FotosAppController } from './fotos-app.controller';
import { FotosAppService } from './fotos-app.service';

/** Los retos con foto (HU-322): enviar desde la app. El trabajador procesa la foto. */
@Module({
  imports: [AuthModule, ArchivosModule],
  controllers: [FotosAppController],
  providers: [
    {
      provide: FotosAppService,
      inject: [DbService, ArchivosService, APP_CONFIG, RELOJ],
      useFactory: (db: DbService, archivos: ArchivosService, config: AppConfig, reloj: Reloj) =>
        new FotosAppService(db.db, archivos, config.ARCHIVOS_DIR, reloj),
    },
  ],
})
export class FotosModule {}
