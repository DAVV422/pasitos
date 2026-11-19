import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { ArchivosService } from '../archivos/archivos.service';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { FotosAppController } from './fotos-app.controller';
import { FotosAppService } from './fotos-app.service';
import { FotosRevisionController } from './fotos-revision.controller';
import { FotosRevisionService } from './fotos-revision.service';
import { LibroService } from '@pasitos/libro';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { AnulacionesService } from '../movimientos/anulaciones.service';

/** Los retos con foto: enviar desde la app (HU-322; el trabajador la procesa) y revisar (HU-323). */
@Module({
  imports: [AuthModule, ArchivosModule, MovimientosModule],
  controllers: [FotosAppController, FotosRevisionController],
  providers: [
    {
      provide: FotosAppService,
      inject: [DbService, ArchivosService, APP_CONFIG, RELOJ],
      useFactory: (db: DbService, archivos: ArchivosService, config: AppConfig, reloj: Reloj) =>
        new FotosAppService(db.db, archivos, config.ARCHIVOS_DIR, reloj),
    },
    {
      provide: FotosRevisionService,
      inject: [DbService, LibroService, AnulacionesService, APP_CONFIG, RELOJ],
      useFactory: (
        db: DbService,
        libro: LibroService,
        anulaciones: AnulacionesService,
        config: AppConfig,
        reloj: Reloj,
      ) => new FotosRevisionService(db.db, libro, anulaciones, config.ARCHIVOS_DIR, reloj),
    },
  ],
})
export class FotosModule {}
