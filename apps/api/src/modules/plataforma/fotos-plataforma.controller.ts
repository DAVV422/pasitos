import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { eventos } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { FastifyReply } from 'fastify';
import { Plataforma } from '../../common/permisos/marcas';
import { Sesion } from '../../common/sesion/sesion';
import { DbSistemaService } from '../../infra/db/db.module';
import type { ContextoSesion } from '../auth/sesiones.service';
import { toActorPlataforma } from '../bitacora/actores';
import { AccionBitacoraDe, BitacoraService } from '../bitacora/bitacora.service';
import { OperacionesService } from '../invitados/operaciones.service';

/** Pasitos descarga las fotos desde la consola (HU-324 §1, `plataforma.fotos`). */
@Controller('plataforma')
export class FotosPlataformaController {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly operaciones: OperacionesService,
    private readonly sistema: DbSistemaService,
  ) {}

  @Post('eventos/:eventoId/fotos/descargas')
  @Plataforma('escritura')
  @AccionBitacoraDe('foto.descargar')
  @HttpCode(202)
  async createDescarga(
    @Sesion() sesion: ContextoSesion,
    @Param('eventoId', new ParseUUIDPipe()) eventoId: string,
  ) {
    return this.operaciones.createExportacionFotos(
      await this.getEvento(eventoId),
      sesion.usuario.id,
      'consola',
    );
  }

  @Get('eventos/:eventoId/operaciones/:id')
  @Plataforma('escritura')
  @AccionBitacoraDe('foto.descargar')
  async get(
    @Param('eventoId', new ParseUUIDPipe()) eventoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operaciones.get(
      await this.getEvento(eventoId),
      id,
      `/api/v1/plataforma/eventos/${eventoId}`,
    );
  }

  @Get('eventos/:eventoId/operaciones/:id/descarga')
  @Plataforma('escritura')
  @AccionBitacoraDe('foto.descargar')
  async download(
    @Sesion() sesion: ContextoSesion,
    @Param('eventoId', new ParseUUIDPipe()) eventoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('token') token: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const actor = toActorPlataforma(sesion);
    const { datos, fotos } = await this.operaciones.download(
      await this.getEvento(eventoId),
      id,
      token ?? '',
      actor,
    );
    // También en la bitácora de plataforma (sin organización: fuera del RLS).
    await this.sistema.db.transaction((tx) =>
      this.bitacora.record(tx, {
        actor,
        accion: 'foto.descargar',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'operacion', id, nombre: 'Fotos para redes' },
        despues: { fotos, desde: 'consola', eventoId },
      }),
    );
    await reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="fotos-para-redes.zip"')
      .header('Cache-Control', 'no-store')
      .send(datos);
  }

  /** De qué organización es el evento (la consola llega sin rol en el evento). */
  private async getEvento(eventoId: string) {
    const [evento] = await this.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    if (!evento) throw new AppError('NO_ENCONTRADO');
    return { organizacionId: evento.organizacionId, eventoId };
  }
}
