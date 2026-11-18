import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { esquemaCobro } from '@pasitos/dominio/esquemas';
import type { FastifyRequest } from 'fastify';
import {
  Asistente,
  AsistenteActual,
  Firma,
  type ContextoAsistente,
  type FirmaVerificada,
} from '../../common/sesion/asistente';
import { Publica } from '../../common/sesion/sesion';
import { getPedidoIdempotente } from '../acceso/idempotencia';
import { COOKIE_TERMINAL, ConexionService } from '../terminales/conexion.service';
import { CobrosAppService } from './cobros-app.service';
import { MesaService } from './mesa.service';

type RequestConCuerpo = FastifyRequest & { rawBody?: Buffer };

/** La mesa de canje (HU-316, API §7), con su sesión `px_terminal`. Cada pedido cuenta como latido. */
@Controller('mesa')
@Publica()
export class MesaController {
  constructor(
    private readonly mesa: MesaService,
    private readonly conexion: ConexionService,
  ) {}

  private terminal(request: FastifyRequest) {
    return this.conexion.beat(request.cookies[COOKIE_TERMINAL]);
  }

  @Get('catalogo')
  async getCatalogo(@Req() request: FastifyRequest) {
    return this.mesa.getCatalogo(await this.terminal(request));
  }

  @Post('cobros')
  @HttpCode(201)
  async createCobro(@Req() request: RequestConCuerpo, @Body() cuerpo: unknown) {
    const terminal = await this.terminal(request);
    return this.mesa.createCobro(
      terminal,
      esquemaCobro.parse(cuerpo).items,
      getPedidoIdempotente(request),
    );
  }

  @Get('cobros/:id')
  async getCobro(@Req() request: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.mesa.getCobro(await this.terminal(request), id);
  }

  @Post('cobros/:id/cancelar')
  @HttpCode(200)
  async cancel(@Req() request: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.mesa.cancel(await this.terminal(request), id);
  }

  @Get('historial')
  async listHistorial(@Req() request: FastifyRequest) {
    return this.mesa.listHistorial(await this.terminal(request));
  }
}

/** Pagar el cobro desde el celular (HU-313, API §5.2). */
@Controller('app')
export class CobrosAppController {
  constructor(private readonly cobros: CobrosAppService) {}

  @Get('cobros/:token')
  @Asistente()
  getVista(@AsistenteActual() asistente: ContextoAsistente, @Param('token') token: string) {
    return this.cobros.getVista(asistente, token);
  }

  @Post('cobros/:token/confirmar')
  @Asistente({ firmado: true, momento: 'canje' })
  @HttpCode(201)
  confirm(
    @AsistenteActual() asistente: ContextoAsistente,
    @Param('token') token: string,
    @Firma() firma: FirmaVerificada,
  ) {
    return this.cobros.confirm(asistente, token, firma);
  }
}
