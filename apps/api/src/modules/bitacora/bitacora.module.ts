import { Global, Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller';
import { BitacoraService } from './bitacora.service';

/** Bitácora (HU-213): el servicio para escribir (global) y la lista del evento. */
@Global()
@Module({
  controllers: [BitacoraController],
  providers: [{ provide: BitacoraService, useValue: new BitacoraService() }],
  exports: [BitacoraService],
})
export class BitacoraModule {}
