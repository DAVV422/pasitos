import { Module } from '@nestjs/common';
import type { Cifrador } from '@pasitos/db';
import { DbService } from '../../infra/db/db.module';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { AccesoSistema, PROVEEDOR_ACCESO_SISTEMA } from '../acceso/acceso-sistema';
import { AccesoModule } from '../acceso/acceso.module';
import { RegistroTecnicoService } from '../acceso/registro-tecnico';
import { AuthModule, CIFRADOR } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { TerminalesModule } from '../terminales/terminales.module';
import { AccesoService } from '../acceso/acceso.service';
import { CheckInService } from '../puerta/check-in.service';
import { PuertaModule } from '../puerta/puerta.module';
import { AutoregistroService } from './autoregistro.service';
import { MisDatosService } from './mis-datos.service';
import {
  MisDatosController,
  QrRegistroController,
  RegistroAppController,
  SalaRegistroController,
} from './qr-registro.controller';
import { QrRegistroService } from './qr-registro.service';
import { RegistroAppService } from './registro-app.service';

/** Los QR de registro (HU-319): el panel, la tablet en modo Registro y abrir el QR. */
@Module({
  imports: [AuthModule, AccesoModule, PuertaModule, TerminalesModule],
  controllers: [
    QrRegistroController,
    SalaRegistroController,
    RegistroAppController,
    MisDatosController,
  ],
  providers: [
    PROVEEDOR_ACCESO_SISTEMA,
    {
      provide: QrRegistroService,
      inject: [DbService, CIFRADOR, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, cifrador: Cifrador, reloj: Reloj, config: AppConfig) =>
        new QrRegistroService(db.db, cifrador, reloj, config.PUBLIC_URL),
    },
    {
      provide: RegistroAppService,
      inject: [DbService, AccesoSistema, RegistroTecnicoService, CIFRADOR, RELOJ],
      useFactory: (
        db: DbService,
        sistema: AccesoSistema,
        registro: RegistroTecnicoService,
        cifrador: Cifrador,
        reloj: Reloj,
      ) => new RegistroAppService(db.db, sistema, registro, cifrador, reloj),
    },
    {
      provide: AutoregistroService,
      inject: [DbService, AccesoService, CheckInService, RegistroTecnicoService, CIFRADOR, RELOJ],
      useFactory: (
        db: DbService,
        acceso: AccesoService,
        checkIn: CheckInService,
        registro: RegistroTecnicoService,
        cifrador: Cifrador,
        reloj: Reloj,
      ) => new AutoregistroService(db.db, acceso, checkIn, registro, cifrador, reloj),
    },
    {
      provide: MisDatosService,
      inject: [DbService, CIFRADOR, RELOJ],
      useFactory: (db: DbService, cifrador: Cifrador, reloj: Reloj) =>
        new MisDatosService(db.db, cifrador, reloj),
    },
  ],
  exports: [QrRegistroService],
})
export class RegistroModule {}
