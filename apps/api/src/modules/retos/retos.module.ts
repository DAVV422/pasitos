import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { RetosController } from './retos.controller';
import { RetosService } from './retos.service';

/** Retos (HU-207). */
@Module({
  imports: [AuthModule],
  controllers: [RetosController],
  providers: [
    {
      provide: RetosService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new RetosService(db.db, reloj),
    },
  ],
})
export class RetosModule {}
