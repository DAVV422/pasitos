import {
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { TerminalesModule } from '../terminales/terminales.module';
import { EnVivoController, EnVivoTerminalController } from './en-vivo.controller';
import { EnVivoService } from './en-vivo.service';

/** Avisos en vivo por SSE (T-301). */
@Module({
  imports: [TerminalesModule],
  controllers: [EnVivoController, EnVivoTerminalController],
  providers: [
    {
      provide: EnVivoService,
      inject: [DbService, APP_CONFIG],
      // La escucha usa el mismo rol que el API: outbox no tiene RLS.
      useFactory: (db: DbService, config: AppConfig) =>
        new EnVivoService(db.db, config.DATABASE_URL_APP),
    },
  ],
  exports: [EnVivoService],
})
export class EnVivoModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(EnVivoService) private readonly enVivo: EnVivoService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.enVivo.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.enVivo.stop();
  }
}
