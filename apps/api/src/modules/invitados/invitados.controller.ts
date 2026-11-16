import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  esquemaAsistente,
  esquemaBuscarAsistentes,
  esquemaCancelarAsistente,
  esquemaConfirmarImportacion,
  esquemaEditarAsistente,
  esquemaEnlaces,
  esquemaEnviarInvitaciones,
  esquemaExportar,
} from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { readArchivo } from '../archivos/archivos.controller';
import { ArchivosService } from '../archivos/archivos.service';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { AsistentesService } from './asistentes.service';
import { InvitacionesAsistentesService } from './invitaciones.service';
import { OperacionesService } from './operaciones.service';

function pick<T extends object>(datos: T, cuerpo: unknown): Partial<T> {
  const enviados = new Set(Object.keys((cuerpo ?? {}) as object));
  return Object.fromEntries(
    Object.entries(datos).filter(([campo]) => enviados.has(campo)),
  ) as Partial<T>;
}

/** La lista de invitados (HU-210, API §4.5). */
@Controller()
export class InvitadosController {
  constructor(
    private readonly asistentes: AsistentesService,
    private readonly operaciones: OperacionesService,
    private readonly archivos: ArchivosService,
    private readonly invitaciones: InvitacionesAsistentesService,
  ) {}

  /** También el registrador (puerta, fase 3): para él, el correo va enmascarado. */
  @Get('eventos/:eventoId/asistentes')
  @Permiso('invitados.read')
  async search(@Contexto() contexto: ContextoEvento, @Query() query: unknown) {
    const { items, nextCursor } = await this.asistentes.search(
      contexto,
      esquemaBuscarAsistentes.parse(query),
    );
    return { items, pagination: { nextCursor } };
  }

  @Get('eventos/:eventoId/asistentes/contadores')
  @Permiso('invitados.read')
  count(@Contexto() contexto: ContextoEvento) {
    return this.asistentes.countPorEstado(contexto);
  }

  @Post('eventos/:eventoId/asistentes')
  @Permiso('invitados.update')
  @AccionBitacoraDe('asistente.create')
  create(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.asistentes.create(contexto, esquemaAsistente.parse(cuerpo));
  }

  @Patch('asistentes/:id')
  @Permiso('invitados.update', { recurso: 'asistentes' })
  @AccionBitacoraDe('asistente.update')
  async update(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    const { fila } = await this.asistentes.update(
      contexto,
      id,
      pick(esquemaEditarAsistente.parse(cuerpo), cuerpo),
    );
    return fila;
  }

  @Post('asistentes/:id/cancelar')
  @Permiso('invitados.update', { recurso: 'asistentes' })
  @AccionBitacoraDe('asistente.cancel')
  @HttpCode(200)
  cancel(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.asistentes.cancel(
      contexto,
      id,
      esquemaCancelarAsistente.parse(cuerpo ?? {}).motivo,
    );
  }

  /** Paso 1: subir el CSV (validado como en HU-214 §5); el trabajador arma la vista previa. */
  @Post('eventos/:eventoId/importaciones')
  @Permiso('invitados.update')
  @AccionBitacoraDe('archivo.upload')
  @HttpCode(202)
  async createImportacion(@Contexto() contexto: ContextoEvento, @Req() request: FastifyRequest) {
    this.archivos.checkLimite(contexto.usuarioId);
    const archivo = await this.archivos.upload(
      contexto,
      'importacion_csv',
      await readArchivo(request, 'importacion_csv', this.archivos),
    );
    return this.operaciones.createImportacion(contexto, archivo.id);
  }

  /** Paso 2: importar las válidas (y las posibles duplicadas elegidas). */
  @Post('importaciones/:id/confirmar')
  @Permiso('invitados.update', { recurso: 'importaciones' })
  @AccionBitacoraDe('importacion.confirm')
  @HttpCode(200)
  confirm(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    const { incluirPosiblesDuplicadas } = esquemaConfirmarImportacion.parse(cuerpo ?? {});
    return this.operaciones.confirm(contexto, id, incluirPosiblesDuplicadas);
  }

  @Post('eventos/:eventoId/exportaciones')
  @Permiso('invitados.export')
  @HttpCode(202)
  createExportacion(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.operaciones.createExportacion(contexto, esquemaExportar.parse(cuerpo ?? {}).estado);
  }

  // ── Invitaciones por correo (HU-211) ───────────────────────────────────────

  @Get('eventos/:eventoId/invitaciones/envios/estimacion')
  @Permiso('invitados.read')
  estimate(@Contexto() contexto: ContextoEvento) {
    return this.invitaciones.estimate(contexto);
  }

  @Post('eventos/:eventoId/invitaciones/envios')
  @Permiso('invitados.update')
  @AccionBitacoraDe('invitaciones.send')
  @HttpCode(202)
  send(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.invitaciones.send(
      contexto,
      esquemaEnviarInvitaciones.parse(cuerpo ?? {}).asistenteIds,
    );
  }

  @Post('asistentes/:id/invitacion/reenviar')
  @Permiso('invitados.update', { recurso: 'asistentes' })
  @AccionBitacoraDe('invitacion.resend')
  @HttpCode(202)
  resend(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.invitaciones.resend(contexto, id);
  }

  /** Crea las que falten: por eso es `invitados.update` y deja su fila en la bitácora. */
  @Get('eventos/:eventoId/invitaciones/enlaces')
  @Permiso('invitados.update')
  @AccionBitacoraDe('invitaciones.enlaces.view')
  async listEnlaces(
    @Contexto() contexto: ContextoEvento,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { asistenteIds, formato } = esquemaEnlaces.parse(query);
    const items = await this.invitaciones.listEnlaces(contexto, asistenteIds);
    void reply.header('Cache-Control', 'no-store');
    if (formato === 'csv') {
      void reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="enlaces-invitacion.csv"');
      return this.invitaciones.toCsv(items);
    }
    return { items };
  }

  @Get('operaciones/:id')
  @Permiso('invitados.export', { recurso: 'operaciones' })
  get(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.operaciones.get(contexto, id);
  }

  @Get('operaciones/:id/descarga')
  @Permiso('invitados.export', { recurso: 'operaciones' })
  async download(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('token') token: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const csv = await this.operaciones.download(contexto, id, token ?? '');
    await reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="invitados.csv"')
      .header('Cache-Control', 'no-store')
      .send(csv);
  }
}
