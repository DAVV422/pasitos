import { Module } from '@nestjs/common';
import { LibroService } from '@pasitos/libro';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { AjustesController } from './ajustes.controller';
import { AjustesService } from './ajustes.service';
import { AnulacionesService } from './anulaciones.service';
import { CanjesManualesService } from './canjes-manuales.service';
import { MovimientosModule } from './movimientos.module';

/** Ajustes de puntos, retos otorgados y anular canjes (HU-317); canjes manuales (HU-412). */
@Module({
  imports: [AuthModule, MovimientosModule],
  controllers: [AjustesController],
  providers: [
    {
      provide: AjustesService,
      inject: [DbService, LibroService, AnulacionesService, RELOJ],
      useFactory: (
        db: DbService,
        libro: LibroService,
        anulaciones: AnulacionesService,
        reloj: Reloj,
      ) => new AjustesService(db.db, libro, anulaciones, reloj),
    },
    {
      provide: CanjesManualesService,
      inject: [DbService, LibroService, RELOJ],
      useFactory: (db: DbService, libro: LibroService, reloj: Reloj) =>
        new CanjesManualesService(db.db, libro, reloj),
    },
  ],
})
export class AjustesModule {}
