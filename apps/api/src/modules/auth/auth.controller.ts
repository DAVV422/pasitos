import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  esquemaCambiarPassword,
  esquemaCodigoTotp,
  esquemaLogin,
  esquemaNombrePasskey,
  esquemaOlvide,
  esquemaRestablecer,
} from '@pasitos/dominio/esquemas';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { SoloSesion } from '../../common/permisos/marcas';
import { Publica, Sesion, SinSegundoFactor } from '../../common/sesion/sesion';
import { AuthService } from './auth.service';
import { describeDispositivo } from './dispositivo';
import { SegundoFactorService } from './segundo-factor.service';
import { COOKIE_EQUIPO, SesionesService, type ContextoSesion } from './sesiones.service';

/** La respuesta de WebAuthn del navegador: la valida @simplewebauthn/server. */
const esquemaRespuestaWebAuthn = z.looseObject({
  id: z.string().min(1).max(1_024),
  rawId: z.string().min(1).max(1_024),
  type: z.literal('public-key'),
  response: z.looseObject({}),
});

const esquemaAltaPasskey = esquemaNombrePasskey.extend({ respuesta: esquemaRespuestaWebAuthn });

const esquemaDiagnosticoPasskey = z.object({
  etapa: z.enum(['registro', 'verificacion']),
  error: z.string().max(80),
});

/** `/auth` (API §3.1, HU-201). El controlador solo valida y arma la respuesta. */
@Controller('auth')
@SoloSesion()
export class AuthController {
  private readonly logger = new Logger('Passkeys');

  constructor(
    private readonly auth: AuthService,
    private readonly sesiones: SesionesService,
    private readonly segundoFactor: SegundoFactorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  @Publica()
  @HttpCode(200)
  async login(
    @Body() cuerpo: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { email, password } = esquemaLogin.parse(cuerpo);
    const { token, contexto } = await this.auth.login(email, password, {
      ip: request.ip,
      descripcion: describeDispositivo(request.headers['user-agent']),
    });
    void reply.setCookie(COOKIE_EQUIPO, token, this.getOpcionesCookie());
    return {
      usuario: toUsuario(contexto),
      requiereSegundoFactor:
        contexto.segundoFactor.estado === 'por_configurar' ||
        contexto.segundoFactor.estado === 'por_verificar',
      segundoFactor: toSegundoFactor(contexto),
    };
  }

  @Post('logout')
  @SinSegundoFactor('cualquiera')
  @HttpCode(204)
  async logout(@Sesion() sesion: ContextoSesion, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.sesiones.revoke(sesion.sessionId, sesion.usuario.id);
    void reply.clearCookie(COOKIE_EQUIPO, this.getOpcionesCookie());
  }

  @Get('yo')
  @SinSegundoFactor('cualquiera')
  getYo(@Sesion() sesion: ContextoSesion) {
    return { usuario: toUsuario(sesion), segundoFactor: toSegundoFactor(sesion) };
  }

  // ── Contraseña ─────────────────────────────────────────────────────────────

  @Post('password/olvide')
  @Publica()
  @HttpCode(202)
  async requestRestablecer(@Body() cuerpo: unknown): Promise<void> {
    const { email, app } = esquemaOlvide.parse(cuerpo);
    await this.auth.requestRestablecer(email, app);
  }

  @Post('password/restablecer')
  @Publica()
  @HttpCode(204)
  async restablecer(@Body() cuerpo: unknown): Promise<void> {
    const { token, password } = esquemaRestablecer.parse(cuerpo);
    await this.auth.restablecer(token, password);
  }

  @Put('password')
  @HttpCode(204)
  async changePassword(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown): Promise<void> {
    const { actual, nueva } = esquemaCambiarPassword.parse(cuerpo);
    await this.auth.changePassword(sesion, actual, nueva);
  }

  // ── Sesiones abiertas ──────────────────────────────────────────────────────

  @Get('sessions')
  async listSessions(@Sesion() sesion: ContextoSesion) {
    const lista = await this.sesiones.list(sesion.usuario.id);
    return {
      items: lista.map((s) => ({ ...s, actual: s.id === sesion.sessionId })),
      pagination: { nextCursor: null },
    };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.sesiones.revoke(id, sesion.usuario.id);
  }

  // ── Segundo factor: app de códigos ─────────────────────────────────────────

  @Post('segundo-factor/totp/configurar')
  @SinSegundoFactor('configurar')
  @HttpCode(200)
  startTotp(@Sesion() sesion: ContextoSesion) {
    return this.segundoFactor.startTotp(sesion);
  }

  @Post('segundo-factor/totp/confirmar')
  @SinSegundoFactor('configurar')
  @HttpCode(204)
  async confirmTotp(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown): Promise<void> {
    await this.segundoFactor.confirmTotp(sesion, esquemaCodigoTotp.parse(cuerpo).codigo);
  }

  @Post('segundo-factor/totp')
  @SinSegundoFactor('verificar')
  @HttpCode(204)
  async verifyTotp(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown): Promise<void> {
    await this.segundoFactor.verifyTotp(sesion, esquemaCodigoTotp.parse(cuerpo).codigo);
  }

  @Delete('segundo-factor/totp')
  @HttpCode(204)
  async removeTotp(@Sesion() sesion: ContextoSesion): Promise<void> {
    await this.segundoFactor.removeTotp(sesion);
  }

  // ── Segundo factor: passkeys ───────────────────────────────────────────────

  @Get('passkeys')
  async listPasskeys(@Sesion() sesion: ContextoSesion) {
    return {
      items: await this.segundoFactor.listPasskeys(sesion.usuario.id),
      pagination: { nextCursor: null },
    };
  }

  @Post('passkeys/opciones')
  @SinSegundoFactor('configurar')
  @HttpCode(200)
  startRegistroPasskey(@Sesion() sesion: ContextoSesion) {
    return this.segundoFactor.startRegistroPasskey(sesion);
  }

  @Post('passkeys')
  @SinSegundoFactor('configurar')
  registerPasskey(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown) {
    const { respuesta, nombre } = esquemaAltaPasskey.parse(cuerpo);
    return this.segundoFactor.registerPasskey(
      sesion,
      respuesta as unknown as RegistrationResponseJSON,
      nombre,
    );
  }

  @Delete('passkeys/:id')
  @HttpCode(204)
  async deletePasskey(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.segundoFactor.deletePasskey(sesion, id);
  }

  /**
   * Lo que falló en el navegador al crear o usar una passkey (el servidor no se entera de otro
   * modo). Solo el nombre del error y el tipo de equipo: nada personal.
   */
  @Post('passkeys/diagnostico')
  @SinSegundoFactor('cualquiera')
  @HttpCode(204)
  reportPasskey(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown): void {
    const datos = esquemaDiagnosticoPasskey.safeParse(cuerpo);
    if (datos.success) {
      this.logger.warn(
        { usuarioId: sesion.usuario.id, dispositivo: sesion.dispositivo, ...datos.data },
        'La passkey falló en el navegador',
      );
    }
  }

  @Post('segundo-factor/passkey/opciones')
  @SinSegundoFactor('verificar')
  @HttpCode(200)
  startVerificacionPasskey(@Sesion() sesion: ContextoSesion) {
    return this.segundoFactor.startVerificacionPasskey(sesion);
  }

  @Post('segundo-factor/passkey')
  @SinSegundoFactor('verificar')
  @HttpCode(204)
  async verifyPasskey(@Sesion() sesion: ContextoSesion, @Body() cuerpo: unknown): Promise<void> {
    const respuesta = esquemaRespuestaWebAuthn.parse(cuerpo);
    await this.segundoFactor.verifyPasskey(
      sesion,
      respuesta as unknown as AuthenticationResponseJSON,
    );
  }

  /** `HttpOnly`, `SameSite=Lax`, `Path=/api`; `Secure` cuando el origen es https. */
  private getOpcionesCookie() {
    return {
      httpOnly: true,
      secure: this.config.PUBLIC_URL.startsWith('https://'),
      sameSite: 'lax' as const,
      path: '/api',
    };
  }
}

function toUsuario(sesion: ContextoSesion) {
  return {
    id: sesion.usuario.id,
    email: sesion.usuario.email,
    nombre: sesion.usuario.nombre,
    rolPlataforma: sesion.usuario.rolPlataforma,
  };
}

function toSegundoFactor(sesion: ContextoSesion) {
  return {
    requerido: sesion.segundoFactor.requerido,
    configurado: sesion.segundoFactor.metodos.length > 0,
    metodos: sesion.segundoFactor.metodos,
    estado: sesion.segundoFactor.estado,
    apagado: sesion.segundoFactor.apagado,
    verificadoAt: sesion.segundoFactorAt,
  };
}
