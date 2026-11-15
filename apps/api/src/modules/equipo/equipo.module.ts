import { Module } from '@nestjs/common';
import { CorreosService } from '@pasitos/correos';
import { RolesCache } from '../../common/permisos/roles.repository';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { InvitacionesService } from '../invitaciones/invitaciones.service';
import { PlataformaModule } from '../plataforma/plataforma.module';
import { EquipoController } from './equipo.controller';
import { EquipoService } from './equipo.service';

/** El equipo del evento (HU-203). La invitación se acepta en `/auth/invitaciones`. */
@Module({
  imports: [AuthModule, PlataformaModule],
  controllers: [EquipoController],
  providers: [
    {
      provide: EquipoService,
      inject: [DbService, CorreosService, InvitacionesService, RolesCache, RELOJ, APP_CONFIG],
      useFactory: (
        db: DbService,
        correos: CorreosService,
        invitaciones: InvitacionesService,
        roles: RolesCache,
        reloj: Reloj,
        config: AppConfig,
      ) => new EquipoService(db.db, correos, invitaciones, roles, reloj, config.PUBLIC_URL),
    },
  ],
})
export class EquipoModule {}
