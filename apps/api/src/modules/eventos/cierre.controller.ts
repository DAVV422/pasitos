import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { esquemaCerrarEvento, esquemaProgramarCierre } from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { CierreService } from './cierre.service';

/** Cerrar el evento (HU-401): solo el dueño cierra o programa; el equipo ve cómo va. */
@Controller()
export class CierreController {
  constructor(private readonly cierre: CierreService) {}

  @Get('eventos/:eventoId/cierre')
  @Permiso('evento.read')
  getEstado(@Contexto() contexto: ContextoEvento) {
    return this.cierre.getEstado(contexto);
  }

  @Get('eventos/:eventoId/cierre/vista-previa')
  @Permiso('evento.close')
  getVistaPrevia(@Contexto() contexto: ContextoEvento) {
    return this.cierre.getVistaPrevia(contexto);
  }

  @Post('eventos/:eventoId/cerrar')
  @Permiso('evento.close')
  @AccionBitacoraDe('evento.close')
  @HttpCode(202)
  close(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.cierre.close(contexto, esquemaCerrarEvento.parse(cuerpo).confirmacion);
  }

  @Put('eventos/:eventoId/cierre/programado')
  @Permiso('evento.close')
  @AccionBitacoraDe('evento.cierre_programar')
  @HttpCode(200)
  schedule(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    const { at } = esquemaProgramarCierre.parse(cuerpo);
    return this.cierre.schedule(contexto, at ? new Date(at) : null);
  }
}
