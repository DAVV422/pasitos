import { Global, Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule, Reflector } from '@nestjs/core';
import { DbSistemaService } from '../../infra/db/db.module';
import { AuthModule } from '../../modules/auth/auth.module';
import { SesionesService } from '../../modules/auth/sesiones.service';
import { SessionGuard } from '../sesion/sesion';
import { PermisosGuard } from './permisos.guard';
import { MisEventosService, RolesCache, RolesRepository } from './roles.repository';

/**
 * Los guards globales, **en este orden**: primero la sesión (HU-201) y después los permisos del
 * evento (HU-204). Toda ruta tiene una marca: `@Publica`, `@SoloSesion`, `@Permiso` o
 * `@Plataforma` (lo revisa `checkMarcasDeRutas` al arrancar).
 */
@Global()
@Module({
  imports: [AuthModule, DiscoveryModule],
  providers: [
    { provide: RolesCache, useFactory: () => new RolesCache() },
    {
      provide: MisEventosService,
      inject: [DbSistemaService],
      useFactory: (sistema: DbSistemaService) => new MisEventosService(sistema.db),
    },
    {
      provide: RolesRepository,
      inject: [DbSistemaService],
      useFactory: (sistema: DbSistemaService) => new RolesRepository(sistema.db),
    },
    {
      provide: APP_GUARD,
      inject: [Reflector, SesionesService],
      useFactory: (reflector: Reflector, sesiones: SesionesService) =>
        new SessionGuard(reflector, sesiones),
    },
    {
      provide: APP_GUARD,
      inject: [Reflector, RolesRepository, RolesCache],
      useFactory: (reflector: Reflector, roles: RolesRepository, cache: RolesCache) =>
        new PermisosGuard(reflector, roles, cache),
    },
  ],
  exports: [RolesCache, RolesRepository, MisEventosService],
})
export class SeguridadModule {}
