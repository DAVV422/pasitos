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
        SaludModule,
        MovimientosModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }
}
