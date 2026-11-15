import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { ArchivosService } from '../archivos/archivos.service';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { PremiosController } from './premios.controller';
import { PremiosService } from './premios.service';

/** Catálogo de canje (HU-208). */
@Module({
  imports: [AuthModule, ArchivosModule],
  controllers: [PremiosController],
  providers: [
    {
      provide: PremiosService,
      inject: [DbService, ArchivosService, RELOJ],
      useFactory: (db: DbService, archivos: ArchivosService, reloj: Reloj) =>
        new PremiosService(db.db, archivos, reloj),
    },
  ],
})
export class PremiosModule {}
