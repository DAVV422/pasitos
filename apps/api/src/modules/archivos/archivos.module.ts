import { Module } from '@nestjs/common';
import { RolesRepository } from '../../common/permisos/roles.repository';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { SesionesAsistenteService } from '../acceso/sesiones-asistente';
import { AuthModule } from '../auth/auth.module';
import { TerminalesModule } from '../terminales/terminales.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { ArchivosController } from './archivos.controller';
import { ArchivosService } from './archivos.service';
import { createTraerMapaGoogle, UbicacionService, type TraerMapa } from './ubicacion.service';

export const TRAER_MAPA = Symbol('TRAER_MAPA');

/** Subida, validación y entrega de archivos (HU-214) y la ubicación con su mapa. */
@Module({
  imports: [AuthModule, TerminalesModule],
  controllers: [ArchivosController],
  providers: [
    {
      provide: ArchivosService,
      inject: [DbService, RolesRepository, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, roles: RolesRepository, reloj: Reloj, config: AppConfig) =>
        new ArchivosService(db.db, roles, reloj, config.ARCHIVOS_DIR),
    },
    {
      // Para servir las imágenes de un evento privado al celular vinculado (sin estado propio).
      provide: SesionesAsistenteService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new SesionesAsistenteService(db.db, reloj),
    },
    {
      provide: TRAER_MAPA,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): TraerMapa =>
        createTraerMapaGoogle(config.GOOGLE_MAPS_LLAVE_SERVIDOR),
    },
    {
      provide: UbicacionService,
      inject: [DbService, ArchivosService, TRAER_MAPA],
      useFactory: (db: DbService, archivos: ArchivosService, traerMapa: TraerMapa) =>
        new UbicacionService(db.db, archivos, traerMapa),
    },
  ],
  exports: [ArchivosService],
})
export class ArchivosModule {}
