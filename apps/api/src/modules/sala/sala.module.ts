import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { TerminalesModule } from '../terminales/terminales.module';
import { ControlesPantallaService } from './controles.service';
import { PantallasControlController } from './pantallas-control.controller';
import { SalaController } from './sala.controller';
import { SalaService } from './sala.service';

/** La pantalla de sala o stand (HU-314) y sus controles (HU-315). */
@Module({
  imports: [AuthModule, TerminalesModule],
  controllers: [SalaController, PantallasControlController],
  providers: [
    {
      provide: SalaService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new SalaService(db.db, reloj),
    },
    {
      provide: ControlesPantallaService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new ControlesPantallaService(db.db, reloj),
    },
  ],
})
export class SalaModule {}
