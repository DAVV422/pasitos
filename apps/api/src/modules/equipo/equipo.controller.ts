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
import { ROLES_INVITABLES } from '@pasitos/dominio';
import { esquemaEmail } from '@pasitos/dominio/esquemas';
import * as z from 'zod';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { EquipoService } from './equipo.service';

const esquemaRol = z
  .enum(ROLES_INVITABLES as [string, ...string[]])
  .transform((rol) => rol as (typeof ROLES_INVITABLES)[number]);
const esquemaTerminales = z
  .object({
    pantallas: z.array(z.uuid()).max(50).optional(),
    mesas: z.array(z.uuid()).max(50).optional(),
  })
  .optional();
const esquemaTope = z.number().int().min(1).max(100_000).nullable().optional();

const esquemaInvitar = z.object({
  email: esquemaEmail,
  nombre: z.string().trim().min(2).max(80).optional(),
  rol: esquemaRol,
  terminales: esquemaTerminales,
  topeRegistrosPuerta: esquemaTope,
});

const esquemaEditar = z
  .object({
    rol: esquemaRol.optional(),
    terminales: esquemaTerminales,
    topeRegistrosPuerta: esquemaTope,
  })
  .refine(
    (d) => d.rol !== undefined || d.terminales !== undefined || d.topeRegistrosPuerta !== undefined,
    {
      error: 'Indica qué cambiar.',
    },
  );

/** El equipo del evento (HU-203, API §4.4). */
@Controller()
export class EquipoController {
  constructor(private readonly equipo: EquipoService) {}

  @Get('eventos/:eventoId/miembros')
  @Permiso('equipo.read')
  async list(@Contexto() contexto: ContextoEvento) {
    return { items: await this.equipo.list(contexto), pagination: { nextCursor: null } };
  }

  @Post('eventos/:eventoId/miembros')
  @Permiso('equipo.update')
  @AccionBitacoraDe('miembro.invite')
  invite(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.equipo.invite(contexto, esquemaInvitar.parse(cuerpo));
  }

  @Patch('miembros/:id')
  @Permiso('equipo.update', { recurso: 'miembros' })
  @AccionBitacoraDe('miembro.update')
  @HttpCode(204)
  async update(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.equipo.update(contexto, id, esquemaEditar.parse(cuerpo));
  }

  @Post('miembros/:id/reenviar')
  @Permiso('equipo.update', { recurso: 'miembros' })
  @AccionBitacoraDe('miembro.resend')
  @HttpCode(202)
  async resend(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.equipo.resend(contexto, id);
  }

  @Delete('miembros/:id')
  @Permiso('equipo.update', { recurso: 'miembros' })
  @AccionBitacoraDe('miembro.remove')
  @HttpCode(204)
  async remove(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.equipo.remove(contexto, id);
  }
}
