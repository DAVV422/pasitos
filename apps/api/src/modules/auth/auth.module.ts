import { Module } from '@nestjs/common';
import { CorreosService } from '@pasitos/correos';
import { buildCifrador } from '@pasitos/db';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService, DbSistemaService } from '../../infra/db/db.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import {
  HibpAdapter,
  PASSWORDS_FILTRADAS,
  SinConsultaFiltradas,
  type PasswordsFiltradasPort,
} from './passwords-filtradas';
import { SegundoFactorService } from './segundo-factor.service';
import { RELOJ, RELOJ_SISTEMA, SesionesService, type Reloj } from './sesiones.service';

export const CIFRADOR = Symbol('CIFRADOR');

/**
 * Sesión del equipo (HU-201). Los guards globales están en SeguridadModule. Los servicios son
 * clases sin decoradores; aquí se arman.
 */
@Module({
  controllers: [AuthController],
  providers: [
    { provide: RELOJ, useValue: RELOJ_SISTEMA },
    {
      provide: CIFRADOR,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        buildCifrador(config.LLAVE_CIFRADO_DATOS, config.LLAVES_CIFRADO_ANTERIORES),
    },
    {
      provide: PASSWORDS_FILTRADAS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): PasswordsFiltradasPort =>
        config.HIBP_ACTIVO ? new HibpAdapter() : new SinConsultaFiltradas(),
    },
    {
      provide: AuthRepository,
      inject: [DbService, DbSistemaService],
      useFactory: (db: DbService, sistema: DbSistemaService) =>
        new AuthRepository(db.db, sistema.db),
    },
    {
      provide: CorreosService,
      inject: [DbService, APP_CONFIG, RELOJ],
      useFactory: (db: DbService, config: AppConfig, reloj: Reloj) =>
        new CorreosService(
          db.db,
          {
            topeDiario: config.CORREO_TOPE_DIARIO,
            reservaSeguridad: config.CORREO_RESERVA_SEGURIDAD,
          },
          () => reloj.now(),
        ),
    },
    {
      provide: SesionesService,
      inject: [AuthRepository, RELOJ, APP_CONFIG],
      useFactory: (repositorio: AuthRepository, reloj: Reloj, config: AppConfig) =>
        new SesionesService(repositorio, reloj, {
          segundoFactorOrganizaciones: config.SEGUNDO_FACTOR_ORGANIZACIONES === 'obligatorio',
        }),
    },
    {
      provide: AuthService,
      inject: [
        AuthRepository,
        SesionesService,
        CorreosService,
        PASSWORDS_FILTRADAS,
        RELOJ,
        APP_CONFIG,
      ],
      useFactory: (
        repositorio: AuthRepository,
        sesiones: SesionesService,
        correos: CorreosService,
        filtradas: PasswordsFiltradasPort,
        reloj: Reloj,
        config: AppConfig,
      ) =>
        new AuthService(repositorio, sesiones, correos, filtradas, reloj, {
          publicUrl: config.PUBLIC_URL,
        }),
    },
    {
      provide: SegundoFactorService,
      inject: [AuthRepository, CIFRADOR, RELOJ, APP_CONFIG],
      useFactory: (
        repositorio: AuthRepository,
        cifrador: ReturnType<typeof buildCifrador>,
        reloj: Reloj,
        config: AppConfig,
      ) =>
        new SegundoFactorService(repositorio, cifrador, reloj, {
          rpId: config.WEBAUTHN_RP_ID,
          rpNombre: config.WEBAUTHN_RP_NAME,
          origen: new URL(config.PUBLIC_URL).origin,
        }),
    },
  ],
  exports: [SesionesService, CorreosService, CIFRADOR, RELOJ, PASSWORDS_FILTRADAS],
})
export class AuthModule {}
