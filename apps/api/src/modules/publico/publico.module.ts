import { Module } from '@nestjs/common';
import { CorreosService } from '@pasitos/correos';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService, DbSistemaService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { ContactoService } from './contacto.service';
import { EventosPublicosService } from './eventos-publicos.service';
import { PublicoController } from './publico.controller';
import { TurnstileCloudflare, VERIFICADOR_TURNSTILE, type VerificadorTurnstile } from './turnstile';

/** El sitio público (HU-405, HU-410; después HU-406). */
@Module({
  imports: [AuthModule],
  controllers: [PublicoController],
  providers: [
    {
      provide: EventosPublicosService,
      inject: [DbSistemaService, RELOJ],
      useFactory: (sistema: DbSistemaService, reloj: Reloj) =>
        new EventosPublicosService(sistema.db, reloj),
    },
    {
      provide: VERIFICADOR_TURNSTILE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): VerificadorTurnstile | null =>
        config.TURNSTILE_SECRETO ? new TurnstileCloudflare(config.TURNSTILE_SECRETO) : null,
    },
    {
      provide: ContactoService,
      inject: [DbService, CorreosService, RELOJ, APP_CONFIG, VERIFICADOR_TURNSTILE],
      useFactory: (
        db: DbService,
        correos: CorreosService,
        reloj: Reloj,
        config: AppConfig,
        turnstile: VerificadorTurnstile | null,
      ) =>
        new ContactoService(db.db, correos, reloj, {
          llaveDatos: config.LLAVE_CIFRADO_DATOS,
          publicUrl: config.PUBLIC_URL,
          turnstile,
        }),
    },
  ],
  exports: [ContactoService],
})
export class PublicoModule {}
