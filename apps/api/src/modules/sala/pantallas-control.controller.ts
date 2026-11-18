import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { esquemaControlPanel, esquemaHistorialPantalla } from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { ControlesPantallaService } from './controles.service';

/**
 * Los controles a distancia y el historial (HU-315 §2 y §4): D y C en todas; el operador de stand,
 * solo en sus pantallas.
 */
@Controller()
export class PantallasControlController {
  constructor(private readonly controles: ControlesPantallaService) {}

  /** *Mis pantallas*: con su estado, su reto y el contador. */
  @Get('eventos/:eventoId/mis-pantallas')
  @Permiso('panel.read')
  listPantallas(@Contexto() contexto: ContextoEvento) {
    return this.controles.listPantallas(contexto);
  }

  @Post('pantallas/:id/controles')
  @Permiso('pantallas.control', { recurso: 'pantallas' })
  @AccionBitacoraDe('pantalla.control')
  @HttpCode(200)
  control(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.controles.controlDesdePanel(contexto, id, esquemaControlPanel.parse(cuerpo));
  }

  @Get('pantallas/:id/historial')
  @Permiso('panel.read', { recurso: 'pantallas' })
  getHistorial(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    const { desde } = esquemaHistorialPantalla.parse(query);
    return this.controles.getHistorial(contexto, id, desde ? new Date(desde) : undefined);
  }
}
