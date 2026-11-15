import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { esquemaPremio, type DatosPremio } from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { PremiosService } from './premios.service';

function toCambios(cuerpo: unknown): Partial<DatosPremio> {
  const cambios = esquemaPremio.partial().parse(cuerpo) as Record<string, unknown>;
  const enviados = new Set(Object.keys((cuerpo ?? {}) as object));
  return Object.fromEntries(Object.entries(cambios).filter(([campo]) => enviados.has(campo)));
}

/** Catálogo de canje (HU-208, API §4.2). */
@Controller()
export class PremiosController {
  constructor(private readonly premios: PremiosService) {}

  @Get('eventos/:eventoId/premios')
  @Permiso('contenido.read')
  async list(@Contexto() contexto: ContextoEvento) {
    return { items: await this.premios.list(contexto), pagination: { nextCursor: null } };
  }

  @Post('eventos/:eventoId/premios')
  @Permiso('contenido.update')
  @AccionBitacoraDe('premio.create')
  create(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.premios.create(contexto, esquemaPremio.parse(cuerpo));
  }

  @Patch('premios/:id')
  @Permiso('contenido.update', { recurso: 'premios' })
  @AccionBitacoraDe('premio.update')
  update(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.premios.update(contexto, id, toCambios(cuerpo));
  }

  @Delete('premios/:id')
  @Permiso('contenido.update', { recurso: 'premios' })
  @AccionBitacoraDe('premio.delete')
  @HttpCode(204)
  async delete(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.premios.delete(contexto, id);
  }

  @Post('premios/:id/ocultar')
  @Permiso('contenido.update', { recurso: 'premios' })
  @AccionBitacoraDe('premio.hide')
  @HttpCode(200)
  hide(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.premios.setVisible(contexto, id, false);
  }

  @Post('premios/:id/mostrar')
  @Permiso('contenido.update', { recurso: 'premios' })
  @AccionBitacoraDe('premio.show')
  @HttpCode(200)
  show(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.premios.setVisible(contexto, id, true);
  }
}
