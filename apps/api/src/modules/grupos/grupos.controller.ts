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
import { esquemaEditarGrupo, esquemaGrupo, esquemaMiembrosGrupo } from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { GruposService } from './grupos.service';

/** Los grupos del evento (HU-325 §2): D y C. La lista la ve todo el equipo (chips y filtros). */
@Controller()
export class GruposController {
  constructor(private readonly grupos: GruposService) {}

  @Get('eventos/:eventoId/grupos')
  @Permiso('contenido.read')
  list(@Contexto() contexto: ContextoEvento) {
    return this.grupos.list(contexto);
  }

  @Post('eventos/:eventoId/grupos')
  @Permiso('grupos.update')
  @AccionBitacoraDe('grupo.create')
  @HttpCode(201)
  create(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.grupos.create(contexto, esquemaGrupo.parse(cuerpo));
  }

  @Patch('grupos/:id')
  @Permiso('grupos.update', { recurso: 'grupos' })
  @AccionBitacoraDe('grupo.update')
  update(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.grupos.update(contexto, id, esquemaEditarGrupo.parse(cuerpo));
  }

  @Delete('grupos/:id')
  @Permiso('grupos.update', { recurso: 'grupos' })
  @AccionBitacoraDe('grupo.delete')
  @HttpCode(204)
  async delete(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.grupos.delete(contexto, id);
  }

  @Post('grupos/:id/miembros')
  @Permiso('grupos.update', { recurso: 'grupos' })
  @AccionBitacoraDe('grupo.agregar')
  @HttpCode(200)
  addMiembros(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.grupos.addMiembros(contexto, id, esquemaMiembrosGrupo.parse(cuerpo).asistentes);
  }

  @Delete('grupos/:id/miembros/:asistenteId')
  @Permiso('grupos.update', { recurso: 'grupos' })
  @AccionBitacoraDe('grupo.quitar')
  @HttpCode(204)
  async removeMiembro(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('asistenteId', new ParseUUIDPipe()) asistenteId: string,
  ) {
    await this.grupos.removeMiembro(contexto, id, asistenteId);
  }
}
