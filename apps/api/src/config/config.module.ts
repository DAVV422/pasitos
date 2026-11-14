import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './app.config';

/** Expone la configuración ya validada como `APP_CONFIG` (Backend §6). */
@Global()
@Module({})
export class ConfigModule {
  static forConfig(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
