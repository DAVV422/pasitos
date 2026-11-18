import { Module } from '@nestjs/common';
import { LibroService } from '@pasitos/libro';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { CheckInService } from './check-in.service';
import { PuertaController } from './puerta.controller';
import { PuertaService } from './puerta.service';

/** La puerta (HU-301): check-in. HU-302 y HU-303 reutilizan `CheckInService`. */
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
  ],
  exports: [CheckInService],
})
export class PuertaModule {}
