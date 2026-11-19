import { Module } from '@nestjs/common';
import { DbService } from '../../infra/db/db.module';
import { AuthModule } from '../auth/auth.module';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

/** Grupos, retos y premios exclusivos (HU-325). */
@Module({
  imports: [AuthModule],
  controllers: [GruposController],
  providers: [
    {
      provide: GruposService,
      inject: [DbService, RELOJ],
      useFactory: (db: DbService, reloj: Reloj) => new GruposService(db.db, reloj),
    },
  ],
})
export class GruposModule {}
