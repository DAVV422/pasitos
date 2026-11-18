import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { esquemaControlTablet, esquemaQrEmitidos } from '@pasitos/dominio/esquemas';
import type { FastifyRequest } from 'fastify';
import { Publica } from '../../common/sesion/sesion';
import { COOKIE_TERMINAL, ConexionService } from '../terminales/conexion.service';
import { ControlesPantallaService } from './controles.service';
import { SalaService } from './sala.service';

/**
 * La pantalla de sala o stand (HU-314, API §6). La tablet llega con su sesión `px_terminal`
 * (HU-209), no con la del equipo; cada pedido cuenta como latido.
 */
@Controller('sala')
@Publica()
export class SalaController {
  constructor(
    private readonly sala: SalaService,
    private readonly conexion: ConexionService,
    private readonly controles: ControlesPantallaService,
  ) {}

  /** HU-315: los controles en la tablet, con el PIN. */
  @Post('controles')
  @HttpCode(200)
  async control(@Req() request: FastifyRequest, @Body() cuerpo: unknown) {
    const terminal = await this.conexion.beat(request.cookies[COOKIE_TERMINAL]);
    return this.controles.controlDesdeTablet(terminal, esquemaControlTablet.parse(cuerpo));
  }

  @Get('estado')
  async getEstado(@Req() request: FastifyRequest) {
    return this.sala.getEstado(await this.conexion.beat(request.cookies[COOKIE_TERMINAL]));
  }

  @Post('qr-emitidos')
  @HttpCode(200)
  async recordEmitidos(@Req() request: FastifyRequest, @Body() cuerpo: unknown) {
    const terminal = await this.conexion.beat(request.cookies[COOKIE_TERMINAL]);
    return this.sala.recordEmitidos(terminal, esquemaQrEmitidos.parse(cuerpo).items);
  }
}
