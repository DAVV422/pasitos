import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  esquemaAjuste,
  esquemaAnularCanje,
  esquemaCanjeManual,
  esquemaListarAjustes,
  esquemaOtorgamiento,
} from '@pasitos/dominio/esquemas';
import type { FastifyRequest } from 'fastify';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { getPedidoIdempotente } from '../acceso/idempotencia';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { AjustesService } from './ajustes.service';
import { CanjesManualesService } from './canjes-manuales.service';

type RequestConCuerpo = FastifyRequest & { rawBody?: Buffer };

/** Ajustes y anulaciones (HU-317, API §4.8): D y C, con `Idempotency-Key`. */
@Controller()
export class AjustesController {
  constructor(
    private readonly ajustes: AjustesService,
    private readonly canjesManuales: CanjesManualesService,
  ) {}

  @Post('asistentes/:id/ajustes')
  @Permiso('puntos.ajustar', { recurso: 'asistentes' })
  @AccionBitacoraDe('puntos.ajustar')
  @HttpCode(201)
  adjust(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    return this.ajustes.adjust(
      contexto,
      id,
      esquemaAjuste.parse(cuerpo),
      getPedidoIdempotente(request),
    );
  }

  @Post('retos/:id/otorgamientos')
  @Permiso('puntos.ajustar', { recurso: 'retos' })
  @AccionBitacoraDe('reto.otorgar')
  @HttpCode(200)
  grant(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    return this.ajustes.grant(
      contexto,
      id,
      esquemaOtorgamiento.parse(cuerpo),
      getPedidoIdempotente(request),
    );
  }

  /** HU-412: canjear a mano, cuando la persona no puede confirmar con su celular. */
  @Post('eventos/:eventoId/canjes-manuales')
  @Permiso('puntos.ajustar')
  @AccionBitacoraDe('canje.manual')
  @HttpCode(201)
  createCanjeManual(
    @Contexto() contexto: ContextoEvento,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    return this.canjesManuales.create(
      contexto,
      esquemaCanjeManual.parse(cuerpo),
      getPedidoIdempotente(request),
    );
  }

  @Post('canjes/:id/anular')
  @Permiso('puntos.ajustar', { recurso: 'canjes' })
  @AccionBitacoraDe('canje.anular')
  @HttpCode(200)
  cancelCanje(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    const { motivo } = esquemaAnularCanje.parse(cuerpo);
    return this.ajustes.cancelCanje(contexto, id, motivo, getPedidoIdempotente(request));
  }

  /** Lo que se lee va con `bitacora.read`: los mismos roles (D y C). */
  @Get('eventos/:eventoId/ajustes')
  @Permiso('bitacora.read')
  list(@Contexto() contexto: ContextoEvento, @Query() query: unknown) {
    return this.ajustes.list(contexto, esquemaListarAjustes.parse(query));
  }

  @Get('eventos/:eventoId/canjes')
  @Permiso('bitacora.read')
  searchCanjes(@Contexto() contexto: ContextoEvento, @Query('q') q: string | undefined) {
    return this.ajustes.searchCanjes(contexto, q ?? '');
  }
}
