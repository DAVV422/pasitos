import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { buildLoggerParams } from './common/observabilidad/logger';
import { type AppConfig } from './config/app.config';
import { ConfigModule } from './config/config.module';
import { DbModule } from './infra/db/db.module';
import { SeguridadModule } from './common/permisos/seguridad.module';
import { AuthModule } from './modules/auth/auth.module';
import { BitacoraModule } from './modules/bitacora/bitacora.module';
import { ArchivosModule } from './modules/archivos/archivos.module';
import { ContenidoModule } from './modules/contenido/contenido.module';
import { PremiosModule } from './modules/premios/premios.module';
import { RetosModule } from './modules/retos/retos.module';
import { TerminalesModule } from './modules/terminales/terminales.module';
import { InvitadosModule } from './modules/invitados/invitados.module';
import { EquipoModule } from './modules/equipo/equipo.module';
import { EnVivoModule } from './modules/en-vivo/en-vivo.module';
import { AccesoModule } from './modules/acceso/acceso.module';
import { EventosModule } from './modules/eventos/eventos.module';
import { PlataformaModule } from './modules/plataforma/plataforma.module';
import { MovimientosModule } from './modules/movimientos/movimientos.module';
import { SaludModule } from './modules/salud/salud.module';

@Module({})
export class AppModule {
  static forConfig(
    config: AppConfig,
    opciones: { destinoLogs?: NodeJS.WritableStream } = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot(buildLoggerParams(config, opciones.destinoLogs)),
        ConfigModule.forConfig(config),
        DbModule,
        AuthModule,
        SeguridadModule,
        BitacoraModule,
        PlataformaModule,
        EventosModule,
        EquipoModule,
        ArchivosModule,
        ContenidoModule,
        RetosModule,
        PremiosModule,
        TerminalesModule,
        InvitadosModule,
        SaludModule,
        MovimientosModule,
        EnVivoModule,
        AccesoModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }
}
