import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { esquemaReclamo } from '@pasitos/dominio/esquemas';
import {
  Asistente,
  AsistenteActual,
  Firma,
  type ContextoAsistente,
  type FirmaVerificada,
} from '../../common/sesion/asistente';
import { ReclamosService } from './reclamos.service';

/** Ganar puntos con un QR (HU-310, API §5.2): firmado e idempotente. */
@Controller('app')
export class ReclamosController {
  constructor(private readonly reclamos: ReclamosService) {}

  @Post('reclamos')
  @Asistente({ firmado: true, momento: 'reclamo' })
  @HttpCode(201)
  claim(
    @AsistenteActual() asistente: ContextoAsistente,
    @Firma() firma: FirmaVerificada,
    @Body() cuerpo: unknown,
  ) {
    return this.reclamos.claim(asistente, esquemaReclamo.parse(cuerpo).qr, firma);
  }
}
