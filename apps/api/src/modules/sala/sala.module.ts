import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { TerminalesModule } from '../terminales/terminales.module';
import { SalaController } from './sala.controller';
import { SalaService } from './sala.service';

/** La pantalla de sala o stand (HU-314). */
@Module({
  imports: [AuthModule, TerminalesModule],
  controllers: [SalaController],
  providers: [
    {
      provide: SalaService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new SalaService(db.db, reloj),
    },
  ],
})
export class SalaModule {}
