import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { EnVivoModule } from '../en-vivo/en-vivo.module';
import { AccesoSistema, PROVEEDOR_ACCESO_SISTEMA } from './acceso-sistema';
import { AccesoController, AppAsistenteController } from './acceso.controller';
import { AccesoService } from './acceso.service';
import { AsistenteGuard } from './asistente.guard';
import { RegistroTecnicoService } from './registro-tecnico';
import { RegistroTecnicoInterceptor } from './registro-tecnico.interceptor';
import { SesionesAsistenteService } from './sesiones-asistente';

/** El acceso del asistente (HU-306): vincular el celular, su sesión y la firma del dispositivo. */
@Module({
  imports: [AuthModule, EnVivoModule],
  controllers: [AccesoController, AppAsistenteController],
  providers: [
    PROVEEDOR_ACCESO_SISTEMA,
    {
      provide: SesionesAsistenteService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new SesionesAsistenteService(db.db, reloj),
    },
    {
      provide: RegistroTecnicoService,
      inject: [DbService],
      useFactory: (db: DbService) => new RegistroTecnicoService(db.db),
    },
    {
      provide: AccesoService,
      inject: [DbService, AccesoSistema, SesionesAsistenteService, RegistroTecnicoService, RELOJ],
      useFactory: (
        db: DbService,
        sistema: AccesoSistema,
        sesiones: SesionesAsistenteService,
        registro: RegistroTecnicoService,
        reloj: Reloj,
      ) => new AccesoService(db.db, sistema, sesiones, registro, reloj),
    },
    // Global: toda ruta `@Asistente()` pasa por aquí, en cualquier módulo.
    {
      provide: APP_GUARD,
      inject: [Reflector, SesionesAsistenteService, RegistroTecnicoService, RELOJ],
      useFactory: (
        reflector: Reflector,
        sesiones: SesionesAsistenteService,
        registro: RegistroTecnicoService,
        reloj: Reloj,
      ) => new AsistenteGuard(reflector, sesiones, registro, reloj),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [Reflector, RegistroTecnicoService, RELOJ],
      useFactory: (reflector: Reflector, registro: RegistroTecnicoService, reloj: Reloj) =>
        new RegistroTecnicoInterceptor(reflector, registro, reloj),
    },
  ],
  exports: [SesionesAsistenteService, RegistroTecnicoService],
})
export class AccesoModule {}
