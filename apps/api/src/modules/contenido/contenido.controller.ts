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
  Put,
} from '@nestjs/common';
import { ESQUEMAS_CONTENIDO, esquemaOrden } from '@pasitos/dominio/esquemas';
import type { z } from 'zod';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { ContenidoService } from './contenido.service';

/** Listas sin paginar (son decenas), con la forma común (API §4.2). */
function toLista<T>(items: T[]) {
  return { items, pagination: { nextCursor: null } };
}

/**
 * `PATCH`: solo los campos que llegan, con las reglas del esquema y sin los valores por defecto
 * (un campo que no llega no se toca).
 */
function toCambios(esquema: z.ZodObject, cuerpo: unknown): Record<string, unknown> {
  const cambios = esquema.partial().parse(cuerpo) as Record<string, unknown>;
  const enviados = new Set(Object.keys((cuerpo ?? {}) as object));
  return Object.fromEntries(Object.entries(cambios).filter(([campo]) => enviados.has(campo)));
}

/** Lugares, agenda, sponsors y preguntas frecuentes (HU-206 §2, API §4.2). */
@Controller()
export class ContenidoController {
  constructor(private readonly contenido: ContenidoService) {}

  // ── lugares ──
  @Get('eventos/:eventoId/lugares')
  @Permiso('contenido.read')
  async listLugares(@Contexto() contexto: ContextoEvento) {
    return toLista(await this.contenido.list(contexto, 'lugares'));
  }

  @Post('eventos/:eventoId/lugares')
  @Permiso('contenido.update')
  @AccionBitacoraDe('lugar.create')
  createLugares(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.contenido.create(contexto, 'lugares', ESQUEMAS_CONTENIDO.lugares.parse(cuerpo));
  }

  @Patch('lugares/:id')
  @Permiso('contenido.update', { recurso: 'lugares' })
  @AccionBitacoraDe('lugar.update')
  updateLugares(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.contenido.update(
      contexto,
      'lugares',
      id,
      toCambios(ESQUEMAS_CONTENIDO.lugares, cuerpo),
    );
  }

  @Delete('lugares/:id')
  @Permiso('contenido.update', { recurso: 'lugares' })
  @AccionBitacoraDe('lugar.delete')
  @HttpCode(204)
  async deleteLugares(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.contenido.delete(contexto, 'lugares', id);
  }

  // ── actividades ──
  @Get('eventos/:eventoId/actividades')
  @Permiso('contenido.read')
  async listActividades(@Contexto() contexto: ContextoEvento) {
    return toLista(await this.contenido.list(contexto, 'actividades'));
  }

  @Post('eventos/:eventoId/actividades')
  @Permiso('contenido.update')
  @AccionBitacoraDe('actividad.create')
  createActividades(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.contenido.create(
      contexto,
      'actividades',
      ESQUEMAS_CONTENIDO.actividades.parse(cuerpo),
    );
  }

  @Patch('actividades/:id')
  @Permiso('contenido.update', { recurso: 'actividades' })
  @AccionBitacoraDe('actividad.update')
  updateActividades(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.contenido.update(
      contexto,
      'actividades',
      id,
      toCambios(ESQUEMAS_CONTENIDO.actividades, cuerpo),
    );
  }

  @Delete('actividades/:id')
  @Permiso('contenido.update', { recurso: 'actividades' })
  @AccionBitacoraDe('actividad.delete')
  @HttpCode(204)
  async deleteActividades(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.contenido.delete(contexto, 'actividades', id);
  }

  // ── sponsors ──
  @Get('eventos/:eventoId/sponsors')
  @Permiso('contenido.read')
  async listSponsors(@Contexto() contexto: ContextoEvento) {
    return toLista(await this.contenido.list(contexto, 'sponsors'));
  }

  @Post('eventos/:eventoId/sponsors')
  @Permiso('contenido.update')
  @AccionBitacoraDe('sponsor.create')
  createSponsors(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.contenido.create(contexto, 'sponsors', ESQUEMAS_CONTENIDO.sponsors.parse(cuerpo));
  }

  @Patch('sponsors/:id')
  @Permiso('contenido.update', { recurso: 'sponsors' })
  @AccionBitacoraDe('sponsor.update')
  updateSponsors(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.contenido.update(
      contexto,
      'sponsors',
      id,
      toCambios(ESQUEMAS_CONTENIDO.sponsors, cuerpo),
    );
  }

  @Delete('sponsors/:id')
  @Permiso('contenido.update', { recurso: 'sponsors' })
  @AccionBitacoraDe('sponsor.delete')
  @HttpCode(204)
  async deleteSponsors(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.contenido.delete(contexto, 'sponsors', id);
  }

  // ── preguntas ──
  @Get('eventos/:eventoId/preguntas')
  @Permiso('contenido.read')
  async listPreguntas(@Contexto() contexto: ContextoEvento) {
    return toLista(await this.contenido.list(contexto, 'preguntas'));
  }

  @Post('eventos/:eventoId/preguntas')
  @Permiso('contenido.update')
  @AccionBitacoraDe('pregunta.create')
  createPreguntas(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.contenido.create(contexto, 'preguntas', ESQUEMAS_CONTENIDO.preguntas.parse(cuerpo));
  }

  @Patch('preguntas/:id')
  @Permiso('contenido.update', { recurso: 'preguntas' })
  @AccionBitacoraDe('pregunta.update')
  updatePreguntas(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.contenido.update(
      contexto,
      'preguntas',
      id,
      toCambios(ESQUEMAS_CONTENIDO.preguntas, cuerpo),
    );
  }

  @Delete('preguntas/:id')
  @Permiso('contenido.update', { recurso: 'preguntas' })
  @AccionBitacoraDe('pregunta.delete')
  @HttpCode(204)
  async deletePreguntas(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.contenido.delete(contexto, 'preguntas', id);
  }

  @Put('eventos/:eventoId/preguntas/orden')
  @Permiso('contenido.update')
  @AccionBitacoraDe('preguntas.reorder')
  async reorderPreguntas(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return toLista(
      await this.contenido.reorder(contexto, 'preguntas', esquemaOrden.parse(cuerpo).ids),
    );
  }

  @Put('eventos/:eventoId/sponsors/orden')
  @Permiso('contenido.update')
  @AccionBitacoraDe('sponsor.update')
  async reorderSponsors(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return toLista(
      await this.contenido.reorder(contexto, 'sponsors', esquemaOrden.parse(cuerpo).ids),
    );
  }
}
