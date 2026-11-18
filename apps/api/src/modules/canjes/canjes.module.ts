import { Module } from '@nestjs/common';
import { LibroService } from '@pasitos/libro';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { MovimientosModule } from '../movimientos/movimientos.module';
import { TerminalesModule } from '../terminales/terminales.module';
import { CobrosAppController, MesaController } from './canjes.controller';
import { CobrosAppService } from './cobros-app.service';
import { MesaService } from './mesa.service';

/** Los canjes: la mesa genera el cobro (HU-316) y el celular lo paga (HU-313). */
@Module({
  imports: [AuthModule, MovimientosModule, TerminalesModule],
  controllers: [MesaController, CobrosAppController],
  providers: [
    {
      provide: MesaService,
      inject: [DbService, RELOJ, APP_CONFIG],
      useFactory: (db: DbService, reloj: Reloj, config: AppConfig) =>
        new MesaService(db.db, reloj, config.PUBLIC_URL),
    },
    {
      provide: CobrosAppService,
      inject: [DbService, LibroService, RELOJ],
      useFactory: (db: DbService, libro: LibroService, reloj: Reloj) =>
        new CobrosAppService(db.db, libro, reloj),
    },
  ],
})
export class CanjesModule {}
