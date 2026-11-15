import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { esquemaCrearEvento, type TransicionEvento } from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, SoloSesion, type ContextoEvento } from '../../common/permisos/marcas';
import { MisEventosService } from '../../common/permisos/roles.repository';
import { Sesion } from '../../common/sesion/sesion';
import type { ContextoSesion } from '../auth/sesiones.service';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { EventosService } from './eventos.service';

/** Eventos del panel (HU-205, API §4.1). */
@Controller()
export class EventosController {
  constructor(
    private readonly eventos: EventosService,
    private readonly misEventos: MisEventosService,
  ) {}

  @Get('eventos')
  @SoloSesion()
  async listMisEventos(@Sesion() sesion: ContextoSesion) {
    const filas = await this.misEventos.listEventos(sesion.usuario.id);
    return {
      items: filas.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        slug: e.slug,
        tipo: e.tipo,
        estado: e.estado,
        inicioAt: e.inicio_at,
        finAt: e.fin_at,
        zonaHoraria: e.zona_horaria,
        organizacion: { id: e.organizacion_id, nombre: e.organizacion },
        miRol: e.rol,
      })),
      pagination: { nextCursor: null },
    };
  }

  /** Las organizaciones donde puede crear eventos (es dueña). */
  @Get('organizaciones')
  @SoloSesion()
  async listMisOrganizaciones(@Sesion() sesion: ContextoSesion) {
    return {
      items: await this.misEventos.listOrganizaciones(sesion.usuario.id),
      pagination: { nextCursor: null },
    };
  }

  @Post('organizaciones/:organizacionId/eventos')
  @SoloSesion()
  @AccionBitacoraDe('evento.create')
  create(
    @Sesion() sesion: ContextoSesion,
    @Param('organizacionId', new ParseUUIDPipe()) organizacionId: string,
    @Body() cuerpo: unknown,
  ) {
    return this.eventos.create(sesion, organizacionId, esquemaCrearEvento.parse(cuerpo));
  }

  @Get('eventos/:eventoId')
  @Permiso('evento.read')
  get(@Contexto() contexto: ContextoEvento) {
    return this.eventos.get(contexto);
  }

  /** Todos los roles la leen: dice qué falta, sin datos sensibles. Publicar es de D C. */
  @Get('eventos/:eventoId/lista-de-chequeo')
  @Permiso('evento.read')
  getListaChequeo(@Contexto() contexto: ContextoEvento) {
    return this.eventos.getListaChequeo(contexto);
  }

  @Post('eventos/:eventoId/publicar')
  @Permiso('evento.publish')
  @AccionBitacoraDe('evento.publish')
  @HttpCode(200)
  publish(@Contexto() contexto: ContextoEvento) {
    return this.transition(contexto, 'publicar');
  }

  @Post('eventos/:eventoId/abrir')
  @Permiso('evento.estado')
  @AccionBitacoraDe('evento.open')
  @HttpCode(200)
  open(@Contexto() contexto: ContextoEvento) {
    return this.transition(contexto, 'abrir');
  }

  @Post('eventos/:eventoId/pausar')
  @Permiso('evento.estado')
  @AccionBitacoraDe('evento.pause')
  @HttpCode(200)
  pause(@Contexto() contexto: ContextoEvento) {
    return this.transition(contexto, 'pausar');
  }

  @Post('eventos/:eventoId/reanudar')
  @Permiso('evento.estado')
  @AccionBitacoraDe('evento.resume')
  @HttpCode(200)
  resume(@Contexto() contexto: ContextoEvento) {
    return this.transition(contexto, 'reanudar');
  }

  private transition(contexto: ContextoEvento, transicion: TransicionEvento) {
    return this.eventos.transition(contexto, transicion);
  }
}
