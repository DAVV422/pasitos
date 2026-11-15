import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { and, desc, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import { bitacora } from '@pasitos/db';
import { getTextoAccion } from '@pasitos/dominio';
import {
  esquemaCambiarDueno,
  esquemaCambiarRolPlataforma,
  esquemaCrearOrganizacion,
  esquemaEditarOrganizacion,
  esquemaEmail,
  esquemaEventoPrueba,
  esquemaIntervaloAnclaje,
  esquemaInvitarPlataforma,
  esquemaRestablecerSegundoFactor,
} from '@pasitos/dominio/esquemas';
import { z } from 'zod';
import { Plataforma } from '../../common/permisos/marcas';
import { Sesion } from '../../common/sesion/sesion';
import { DbSistemaService } from '../../infra/db/db.module';
import type { ContextoSesion } from '../auth/sesiones.service';
import { AccionBitacoraDe, type ActorBitacora } from '../bitacora/bitacora.service';
import { toActorPlataforma } from '../bitacora/actores';
import { EventosPlataformaService } from './eventos-plataforma.service';
import { OrganizacionesPlataformaService } from './organizaciones-plataforma.service';
import { PersonasPlataformaService } from './personas-plataforma.service';

const esquemaPagina = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const ROLES_CONSOLA = ['superadmin', 'admin', 'soporte'];

function toActor(sesion: ContextoSesion): ActorBitacora & { tipo: 'usuario' } {
  return toActorPlataforma(sesion) as ActorBitacora & { tipo: 'usuario' };
}

/**
 * Consola de plataforma (HU-202). 👁 `lectura` para todo rol de plataforma; ✏️ `escritura` para
 * administradores; 👑 `superadmin` para nombrar personas de Pasitos.
 */
@Controller('plataforma')
export class PlataformaController {
  constructor(
    private readonly organizaciones: OrganizacionesPlataformaService,
    private readonly eventos: EventosPlataformaService,
    private readonly personas: PersonasPlataformaService,
    @Inject(DbSistemaService) private readonly sistema: DbSistemaService,
  ) {}

  // ── Organizaciones ─────────────────────────────────────────────────────────

  @Get('organizaciones')
  @Plataforma('lectura')
  listOrganizaciones(@Query() consulta: unknown) {
    const filtros = esquemaPagina
      .extend({
        q: z.string().trim().max(80).optional(),
        estado: z.enum(['activa', 'suspendida']).optional(),
      })
      .parse(consulta);
    return this.organizaciones.list(filtros);
  }

  @Get('organizaciones/:id')
  @Plataforma('lectura')
  getOrganizacion(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.organizaciones.get(id);
  }

  @Post('organizaciones')
  @Plataforma('escritura')
  @AccionBitacoraDe('organizacion.create')
  createOrganizacion(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown) {
    return this.organizaciones.create(toActor(sesion), esquemaCrearOrganizacion.parse(cuerpo));
  }

  @Patch('organizaciones/:id')
  @Plataforma('escritura')
  @AccionBitacoraDe('organizacion.update')
  @HttpCode(204)
  async updateOrganizacion(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.organizaciones.update(toActor(sesion), id, esquemaEditarOrganizacion.parse(cuerpo));
  }

  @Post('organizaciones/:id/dueno')
  @Plataforma('escritura')
  @AccionBitacoraDe('organizacion.dueno.invite')
  @HttpCode(202)
  async inviteDueno(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.organizaciones.inviteDueno(toActor(sesion), id, esquemaCambiarDueno.parse(cuerpo));
  }

  @Post('organizaciones/:id/eventos-prueba')
  @Plataforma('escritura')
  @AccionBitacoraDe('plataforma.evento_prueba.create')
  createEventoPrueba(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.organizaciones.createEventoPrueba(
      toActor(sesion),
      id,
      esquemaEventoPrueba.parse(cuerpo),
    );
  }

  // ── Eventos y costo de red ─────────────────────────────────────────────────

  @Get('eventos')
  @Plataforma('lectura')
  listEventos(@Query() consulta: unknown) {
    const filtros = esquemaPagina
      .extend({
        organizacionId: z.uuid().optional(),
        estado: z.string().max(20).optional(),
        tipo: z.enum(['real', 'demo', 'prueba']).optional(),
      })
      .parse(consulta);
    return this.eventos.listEventos(filtros);
  }

  @Patch('eventos/:id')
  @Plataforma('escritura')
  @AccionBitacoraDe('evento.intervalo_anclaje.update')
  @HttpCode(204)
  async updateEvento(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    const { intervaloAnclajeMin, motivo } = esquemaIntervaloAnclaje.parse(cuerpo);
    await this.eventos.updateIntervaloAnclaje(
      id,
      intervaloAnclajeMin,
      {
        tipo: 'usuario',
        id: sesion.usuario.id,
        nombre: sesion.usuario.nombre,
        rol: sesion.usuario.rolPlataforma,
      },
      motivo,
    );
  }

  @Get('costo-red')
  @Plataforma('lectura')
  getCostoRed(@Query() consulta: unknown) {
    const filtros = z
      .object({
        eventoId: z.uuid().optional(),
        mes: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
      })
      .parse(consulta);
    return this.eventos.getCostoRed(filtros);
  }

  // ── Personas ───────────────────────────────────────────────────────────────

  @Get('usuarios')
  @Plataforma('lectura')
  async listUsuarios(@Query() consulta: unknown) {
    const { email } = z.object({ email: esquemaEmail.optional() }).parse(consulta);
    return { items: await this.personas.list({ email }), pagination: { nextCursor: null } };
  }

  @Post('usuarios')
  @Plataforma('superadmin')
  @AccionBitacoraDe('plataforma.usuario.create')
  inviteUsuario(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown) {
    return this.personas.invite(toActor(sesion), esquemaInvitarPlataforma.parse(cuerpo));
  }

  @Patch('usuarios/:id')
  @Plataforma('superadmin')
  @AccionBitacoraDe('plataforma.usuario.update')
  @HttpCode(204)
  async updateUsuario(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.personas.updateRol(toActor(sesion), id, esquemaCambiarRolPlataforma.parse(cuerpo));
  }

  @Post('usuarios/:id/segundo-factor/restablecer')
  @Plataforma('escritura')
  @AccionBitacoraDe('usuario.segundo_factor.reset')
  @HttpCode(204)
  async resetSegundoFactor(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.personas.resetSegundoFactor(
      toActor(sesion),
      id,
      esquemaRestablecerSegundoFactor.parse(cuerpo),
    );
  }

  // ── Bitácora de la consola ─────────────────────────────────────────────────

  @Get('bitacora')
  @Plataforma('lectura')
  async listBitacora(@Query() consulta: unknown) {
    const filtros = esquemaPagina.parse(consulta);
    // Las filas hechas desde la consola: sin organización, o con un rol de plataforma.
    const condiciones: SQL[] = [
      or(isNull(bitacora.organizacionId), inArray(bitacora.actorRol, ROLES_CONSOLA)) as SQL,
    ];
    if (filtros.cursor) {
      condiciones.push(lt(bitacora.id, filtros.cursor));
    }
    const filas = await this.sistema.db
      .select()
      .from(bitacora)
      .where(and(...condiciones))
      .orderBy(desc(bitacora.id))
      .limit(filtros.limit + 1);
    const pagina = filas.slice(0, filtros.limit);
    return {
      items: pagina.map((fila) => ({
        id: fila.id,
        cuando: fila.createdAt,
        quien: { nombre: fila.actorNombre, rol: fila.actorRol, tipo: fila.actorTipo },
        accion: fila.accion,
        texto: getTextoAccion(fila.accion),
        eventoId: fila.eventoId,
        objeto: fila.objetoTipo
          ? { tipo: fila.objetoTipo, id: fila.objetoId, nombre: fila.objetoNombre }
          : null,
        antes: fila.antes,
        despues: fila.despues,
      })),
      pagination: {
        nextCursor: filas.length > filtros.limit ? (pagina.at(-1)?.id ?? null) : null,
      },
    };
  }
}
