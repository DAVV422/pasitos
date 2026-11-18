import { Module } from '@nestjs/common';
import { LibroService } from '@pasitos/libro';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { AnulacionesService } from '../movimientos/anulaciones.service';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { AccesosPuertaService } from './accesos-puerta';
import { AlertasPuertaService } from './alertas-puerta';
import { CheckInService } from './check-in.service';
import { PuertaController } from './puerta.controller';
import { CorreosService } from '@pasitos/correos';
import { PuertaService } from './puerta.service';
import { RegistroPuertaService } from './registro-puerta';

/** La puerta: check-in (HU-301) y QR de asistente (HU-302). Otros módulos reutilizan `CheckInService`. */
@Module({
  imports: [AuthModule, MovimientosModule],
  controllers: [PuertaController],
  providers: [
    {
      provide: CheckInService,
      inject: [LibroService, AnulacionesService],
      useFactory: (libro: LibroService, anulaciones: AnulacionesService) =>
        new CheckInService(libro, anulaciones),
    },
    {
      provide: PuertaService,
      inject: [DbService, CheckInService, RELOJ],
      useFactory: (db: DbService, checkIn: CheckInService, reloj: Reloj) =>
        new PuertaService(db.db, checkIn, reloj),
    },
    {
      provide: RegistroPuertaService,
      inject: [DbService, CheckInService, CorreosService, PuertaService],
      useFactory: (
        db: DbService,
        checkIn: CheckInService,
        correos: CorreosService,
        puerta: PuertaService,
      ) =>
        new RegistroPuertaService(db.db, checkIn, correos, (tx, contexto, id) =>
          puerta.buildFicha(tx, contexto, id),
        ),
    },
    {
      provide: AlertasPuertaService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new AlertasPuertaService(db.db, reloj),
    },
    {
      provide: AccesosPuertaService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new AccesosPuertaService(db.db, reloj, config.PUBLIC_URL),
    },
  ],
  exports: [CheckInService],
})
export class PuertaModule {}
