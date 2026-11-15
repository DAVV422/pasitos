import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { ArchivosService } from '../archivos/archivos.service';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { ContenidoController } from './contenido.controller';
import { ContenidoService } from './contenido.service';

/** Contenido del evento (HU-206 §2). */
@Module({
  imports: [AuthModule, ArchivosModule],
  controllers: [ContenidoController],
  providers: [
    {
      provide: ContenidoService,
      inject: [DbService, ArchivosService, RELOJ],
      useFactory: (db: DbService, archivos: ArchivosService, reloj: Reloj) =>
        new ContenidoService(db.db, archivos, reloj),
    },
  ],
})
export class ContenidoModule {}
