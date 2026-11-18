import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { withOrganizacion } from '@pasitos/db';
import { AppError, TIPOS_ACCESO, type TipoAcceso } from '@pasitos/dominio';
import { esquemaVincular } from '@pasitos/dominio/esquemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Asistente, AsistenteActual, type ContextoAsistente } from '../../common/sesion/asistente';
import { Publica } from '../../common/sesion/sesion';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { DbService } from '../../infra/db/db.module';
import { EnVivoService } from '../en-vivo/en-vivo.service';
import { AccesoService } from './acceso.service';
import { getEstadoApp } from './estado-app';
import { COOKIE_ASISTENTE, COOKIE_DISPOSITIVO } from './sesiones-asistente';

function toTipo(valor: string): TipoAcceso {
  if (!(TIPOS_ACCESO as readonly string[]).includes(valor)) {
    throw new AppError('NO_ENCONTRADO');
  }
  return valor as TipoAcceso;
}

/** Antes de vincular (API §5.1): ver el enlace y vincular el navegador (HU-306). */
@Controller('acceso')
@Publica()
export class AccesoController {
  constructor(
    private readonly acceso: AccesoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(':tipo/:token')
  describe(
    @Param('tipo') tipo: string,
    @Param('token') token: string,
    @Req() request: FastifyRequest,
  ) {
    return this.acceso.describe(
      toTipo(tipo),
      token,
      request.ip,
      request.cookies[COOKIE_DISPOSITIVO],
    );
  }

  @Post('vincular')
  @HttpCode(201)
  async vincular(
    @Body() cuerpo: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { sesion, expiraAt, estado } = await this.acceso.vincular(
      esquemaVincular.parse(cuerpo),
      request.ip,
      request.headers['user-agent'] ?? '',
    );
    void reply.setCookie(COOKIE_ASISTENTE, sesion, {
      httpOnly: true,
      secure: this.config.PUBLIC_URL.startsWith('https://'),
      sameSite: 'lax',
      path: '/api',
      expires: expiraAt,
    });
    return estado;
  }
}

/** La app del asistente vinculado (API §5.2). */
@Controller('app')
export class AppAsistenteController {
  constructor(
    private readonly db: DbService,
    private readonly enVivo: EnVivoService,
  ) {}

  /** La base de HU-306; HU-308 suma retos, premios, movimientos y el `ETag`. */
  @Get('estado')
  @Asistente()
  getEstado(@AsistenteActual() asistente: ContextoAsistente) {
    return withOrganizacion(this.db.db, asistente.organizacionId, (tx) =>
      getEstadoApp(tx, asistente.asistenteId),
    );
  }

  /** T-301: saldo, pausa, cierre y dispositivo anulado, en vivo. */
  @Get('en-vivo')
  @Asistente()
  async openEnVivo(
    @AsistenteActual() asistente: ContextoAsistente,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.enVivo.open(
      request,
      reply,
      {
        tipo: 'asistente',
        eventoId: asistente.eventoId,
        asistenteId: asistente.asistenteId,
        dispositivoId: asistente.dispositivoId,
      },
      `asistente:${asistente.sessionId}`,
    );
  }
}
