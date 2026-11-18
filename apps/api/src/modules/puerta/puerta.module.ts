import { Module } from '@nestjs/common';
import { LibroService } from '@pasitos/libro';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { AccesosPuertaService } from './accesos-puerta';
import { CheckInService } from './check-in.service';
import { PuertaController } from './puerta.controller';
import { PuertaService } from './puerta.service';

/** La puerta: check-in (HU-301) y QR de asistente (HU-302). Otros módulos reutilizan `CheckInService`. */
@Module({
  imports: [AuthModule, MovimientosModule],
  controllers: [PuertaController],
  providers: [
    {
      provide: CheckInService,
      inject: [LibroService],
      useFactory: (libro: LibroService) => new CheckInService(libro),
    },
    {
      provide: PuertaService,
      inject: [DbService, CheckInService, RELOJ],
      useFactory: (db: DbService, checkIn: CheckInService, reloj: Reloj) =>
        new PuertaService(db.db, checkIn, reloj),
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
