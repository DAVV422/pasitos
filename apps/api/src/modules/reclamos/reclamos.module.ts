import { Module } from '@nestjs/common';
import { LibroService } from '@pasitos/libro';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { ReclamosController } from './reclamos.controller';
import { ReclamosService } from './reclamos.service';

/** Ganar puntos con un QR (HU-310). */
@Module({
  imports: [AuthModule, MovimientosModule],
  controllers: [ReclamosController],
  providers: [
    {
      provide: ReclamosService,
      inject: [DbService, LibroService, RELOJ],
      useFactory: (db: DbService, libro: LibroService, reloj: Reloj) =>
        new ReclamosService(db.db, libro, reloj),
    },
  ],
})
export class ReclamosModule {}
