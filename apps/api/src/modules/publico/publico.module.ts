import { Module } from '@nestjs/common';
import { CorreosService } from '@pasitos/correos';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService, DbSistemaService } from '../../infra/db/db.module';
import { AccesoModule } from '../acceso/acceso.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { ContactoService } from './contacto.service';
import { EventosPublicosService } from './eventos-publicos.service';
import { PublicoController } from './publico.controller';
import { TurnstileCloudflare, VERIFICADOR_TURNSTILE, type VerificadorTurnstile } from './turnstile';

/** El sitio público (HU-405, HU-406, HU-410) y el reporte compartido (HU-402). */
@Module({
  imports: [AuthModule, AccesoModule],
  controllers: [PublicoController],
  providers: [
    {
      provide: EventosPublicosService,
      inject: [DbSistemaService, RELOJ, APP_CONFIG],
      useFactory: (sistema: DbSistemaService, reloj: Reloj, config: AppConfig) =>
        new EventosPublicosService(sistema.db, reloj, {
          red: config.STELLAR_RED,
          llaveDatos: config.LLAVE_CIFRADO_DATOS,
        }),
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
