import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { esquemaAceptarInvitacion } from '@pasitos/dominio/esquemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Publica } from '../../common/sesion/sesion';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { describeDispositivo } from '../auth/dispositivo';
import { COOKIE_EQUIPO, SesionesService, type ContextoSesion } from '../auth/sesiones.service';
import { InvitacionesService } from './invitaciones.service';

/** Ver y aceptar una invitación por enlace (HU-202 §2, HU-203 §3). */
@Controller('auth/invitaciones')
@Publica()
export class InvitacionesController {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly sesiones: SesionesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(':token')
  async describe(@Param('token') token: string) {
    const invitacion = await this.invitaciones.describe(token);
    return {
      tipo: invitacion.tipo,
      email: invitacion.email,
      rol: invitacion.rol,
      quienInvita: invitacion.quienInvita,
      organizacion: invitacion.organizacion,
      evento: invitacion.evento,
      app: invitacion.app,
      tieneCuenta: invitacion.tieneCuenta,
    };
  }

  @Post(':token/aceptar')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body() cuerpo: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const datos = esquemaAceptarInvitacion.parse(cuerpo ?? {});
    let sesion: ContextoSesion | null = null;
    try {
      sesion = await this.sesiones.authenticate(request.cookies[COOKIE_EQUIPO]);
    } catch {
      sesion = null;
    }
    const resultado = await this.invitaciones.accept(token, datos, sesion);
    if (resultado.crearSesion) {
      const nueva = await this.sesiones.create(
        resultado.usuarioId,
        describeDispositivo(request.headers['user-agent']),
      );
      void reply.setCookie(COOKIE_EQUIPO, nueva, {
        httpOnly: true,
        secure: this.config.PUBLIC_URL.startsWith('https://'),
        sameSite: 'lax',
        path: '/api',
      });
    }
    return { app: resultado.app };
  }
}
