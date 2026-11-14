import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { buildLoggerParams } from './common/observabilidad/logger';
import { type AppConfig } from './config/app.config';
import { ConfigModule } from './config/config.module';
import { DbModule } from './infra/db/db.module';
import { SaludModule } from './modules/salud/salud.module';

@Module({})
export class AppModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot(buildLoggerParams(config)),
        ConfigModule.forConfig(config),
        DbModule,
        SaludModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }
}
