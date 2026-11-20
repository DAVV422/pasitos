import { Body, Controller, Get, HttpCode, Patch, Post, Query, Res } from '@nestjs/common';
import { esquemaCompartirReporte, esquemaTramoReporte } from '@pasitos/dominio/esquemas';
import type { FastifyReply } from 'fastify';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { ReportesService } from './reportes.service';

/** El reporte del evento cerrado (HU-402): lo ven D C F; regeneran D C; comparte solo el dueño. */
@Controller()
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('eventos/:eventoId/reporte')
  @Permiso('reporte.read')
  get(@Contexto() contexto: ContextoEvento) {
    return this.reportes.get(contexto);
  }

  @Get('eventos/:eventoId/reporte/tramo')
  @Permiso('reporte.read')
  getTramo(@Contexto() contexto: ContextoEvento, @Query() query: unknown) {
    return this.reportes.getTramo(contexto, esquemaTramoReporte.parse(query));
  }

  @Get('eventos/:eventoId/reporte/pdf')
  @Permiso('reporte.read')
  @AccionBitacoraDe('reporte.descargar')
  async getPdf(
    @Contexto() contexto: ContextoEvento,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { contenido, archivo } = await this.reportes.getPdf(contexto);
    void reply
      .header('Cache-Control', 'no-store')
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${archivo}"`);
    return contenido;
  }

  @Get('eventos/:eventoId/reporte/csv')
  @Permiso('reporte.read')
  @AccionBitacoraDe('reporte.descargar')
  async getCsv(
    @Contexto() contexto: ContextoEvento,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // Sin `desde` ni `hasta`, el evento completo.
    const conTramo = typeof query === 'object' && query !== null && Object.keys(query).length > 0;
    const tramo = conTramo ? esquemaTramoReporte.parse(query) : null;
    const { contenido, archivo } = await this.reportes.getCsv(contexto, tramo);
    void reply
      .header('Cache-Control', 'no-store')
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${archivo}"`);
    return contenido;
  }

  @Patch('eventos/:eventoId/reporte')
  @Permiso('reporte.share')
  @AccionBitacoraDe('reporte.publicar')
  share(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.reportes.share(contexto, esquemaCompartirReporte.parse(cuerpo));
  }

  @Post('eventos/:eventoId/reporte/regenerar')
  @Permiso('reporte.regenerate')
  @AccionBitacoraDe('reporte.regenerar')
  @HttpCode(200)
  regenerate(@Contexto() contexto: ContextoEvento) {
    return this.reportes.regenerate(contexto);
  }
}
