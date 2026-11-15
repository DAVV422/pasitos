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
import { esquemaReto, type DatosReto } from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { RetosService } from './retos.service';

/** `PATCH`: solo los campos que llegan (un campo que no llega no se toca). */
function toCambios(cuerpo: unknown): Partial<DatosReto> {
  const cambios = esquemaReto.partial().parse(cuerpo) as Record<string, unknown>;
  const enviados = new Set(Object.keys((cuerpo ?? {}) as object));
  return Object.fromEntries(Object.entries(cambios).filter(([campo]) => enviados.has(campo)));
}

/** Retos (HU-207, API §4.2). */
@Controller()
export class RetosController {
  constructor(private readonly retos: RetosService) {}

  @Get('eventos/:eventoId/retos')
  @Permiso('contenido.read')
  async list(@Contexto() contexto: ContextoEvento) {
    return { items: await this.retos.list(contexto), pagination: { nextCursor: null } };
  }

  @Post('eventos/:eventoId/retos')
  @Permiso('contenido.update')
  @AccionBitacoraDe('reto.create')
  create(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.retos.create(contexto, esquemaReto.parse(cuerpo));
  }

  @Patch('retos/:id')
  @Permiso('contenido.update', { recurso: 'retos' })
  @AccionBitacoraDe('reto.update')
  update(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.retos.update(contexto, id, toCambios(cuerpo));
  }

  /** `{ desactivado: true }` si, publicado el evento, se desactivó en lugar de borrarse. */
  @Delete('retos/:id')
  @Permiso('contenido.update', { recurso: 'retos' })
  @AccionBitacoraDe('reto.delete')
  @HttpCode(200)
  delete(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.retos.delete(contexto, id);
  }

  @Post('retos/:id/desactivar')
  @Permiso('contenido.update', { recurso: 'retos' })
  @AccionBitacoraDe('reto.deactivate')
  @HttpCode(200)
  deactivate(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.retos.setActivo(contexto, id, false);
  }

  @Post('retos/:id/activar')
  @Permiso('contenido.update', { recurso: 'retos' })
  @AccionBitacoraDe('reto.activate')
  @HttpCode(200)
  activate(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.retos.setActivo(contexto, id, true);
  }
}
