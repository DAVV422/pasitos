import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import {
  esquemaAnularCheckIn,
  esquemaCheckIn,
  esquemaEscanearEntrada,
} from '@pasitos/dominio/esquemas';
import type { FastifyRequest } from 'fastify';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { getPedidoIdempotente } from '../acceso/idempotencia';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { PuertaService } from './puerta.service';

type RequestConCuerpo = FastifyRequest & { rawBody?: Buffer };

/**
 * La vista Puerta (HU-301, API §4.6): D, C y R. Lo que solo lee (resumen, ficha, leer *Mi
 * entrada*) va con `invitados.read`, los mismos roles; marcar presente, con `puerta.use`.
 */
@Controller()
export class PuertaController {
  constructor(private readonly puerta: PuertaService) {}

  @Get('eventos/:eventoId/puerta')
  @Permiso('invitados.read')
  getResumen(@Contexto() contexto: ContextoEvento) {
    return this.puerta.getResumen(contexto);
  }

  /** Leer *Mi entrada* no cambia nada: solo devuelve la ficha. */
  @Post('eventos/:eventoId/puerta/escanear-entrada')
  @Permiso('invitados.read')
  @HttpCode(200)
  scanEntrada(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.puerta.scanEntrada(contexto, esquemaEscanearEntrada.parse(cuerpo).qr);
  }

  @Get('asistentes/:id/ficha')
  @Permiso('invitados.read', { recurso: 'asistentes' })
  getFicha(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.puerta.getFicha(contexto, id);
  }

  @Post('asistentes/:id/check-in')
  @Permiso('puerta.use', { recurso: 'asistentes' })
  @AccionBitacoraDe('asistente.check_in')
  @HttpCode(201)
  register(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    const { metodo } = esquemaCheckIn.parse(cuerpo);
    return this.puerta.register(contexto, id, metodo, getPedidoIdempotente(request));
  }

  /** Deshacer mueve puntos: solo D y C (`puntos.ajustar`). */
  @Post('asistentes/:id/check-in/anular')
  @Permiso('puntos.ajustar', { recurso: 'asistentes' })
  @AccionBitacoraDe('asistente.check_in_anular')
  @HttpCode(200)
  undo(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    const { motivo } = esquemaAnularCheckIn.parse(cuerpo);
    return this.puerta.undo(contexto, id, motivo, getPedidoIdempotente(request));
  }
}
