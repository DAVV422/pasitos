import { Module } from '@nestjs/common';
import { CorreosService } from '@pasitos/correos';
import { RolesCache } from '../../common/permisos/roles.repository';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbSistemaService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { PASSWORDS_FILTRADAS, type PasswordsFiltradasPort } from '../auth/passwords-filtradas';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { InvitacionesController } from '../invitaciones/invitaciones.controller';
import {
  createTipoOrganizacion,
  createTipoPlataforma,
  InvitacionesService,
} from '../invitaciones/invitaciones.service';
import { EventosPlataformaService } from './eventos-plataforma.service';
import { OrganizacionesPlataformaService } from './organizaciones-plataforma.service';
import { PersonasPlataformaService } from './personas-plataforma.service';
import { PlataformaController } from './plataforma.controller';

/**
 * Consola de plataforma (HU-202) y las invitaciones por enlace. Usa **solo** la conexión de
 * sistema: trabaja sobre todas las organizaciones, y cada escritura queda en la bitácora.
 */
@Module({
  imports: [AuthModule],
  controllers: [PlataformaController, InvitacionesController],
  providers: [
    {
      provide: InvitacionesService,
      inject: [DbSistemaService, PASSWORDS_FILTRADAS, RELOJ],
      useFactory: (sistema: DbSistemaService, filtradas: PasswordsFiltradasPort, reloj: Reloj) => {
        const servicio = new InvitacionesService(sistema.db, filtradas, reloj);
        servicio.register(createTipoOrganizacion());
        servicio.register(createTipoPlataforma());
        return servicio;
      },
    },
    {
      provide: OrganizacionesPlataformaService,
      inject: [DbSistemaService, CorreosService, InvitacionesService, RELOJ, APP_CONFIG],
      useFactory: (
        sistema: DbSistemaService,
        correos: CorreosService,
        invitaciones: InvitacionesService,
        reloj: Reloj,
        config: AppConfig,
      ) =>
        new OrganizacionesPlataformaService(
          sistema.db,
          correos,
          invitaciones,
          reloj,
          config.PUBLIC_URL,
        ),
    },
    {
      provide: EventosPlataformaService,
      inject: [DbSistemaService],
      useFactory: (sistema: DbSistemaService) => new EventosPlataformaService(sistema.db),
    },
    {
      provide: PersonasPlataformaService,
      inject: [
        DbSistemaService,
        CorreosService,
        InvitacionesService,
        RolesCache,
        RELOJ,
        APP_CONFIG,
      ],
      useFactory: (
        sistema: DbSistemaService,
        correos: CorreosService,
        invitaciones: InvitacionesService,
        roles: RolesCache,
        reloj: Reloj,
        config: AppConfig,
      ) =>
        new PersonasPlataformaService(
          sistema.db,
          correos,
          invitaciones,
          roles,
          reloj,
          config.PUBLIC_URL,
        ),
    },
  ],
  exports: [InvitacionesService],
})
export class PlataformaModule {}
