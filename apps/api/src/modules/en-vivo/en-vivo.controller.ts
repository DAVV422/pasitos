import { Controller, Get, Req, Res } from '@nestjs/common';
import { AppError } from '@pasitos/dominio';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { Publica, type RequestConSesion } from '../../common/sesion/sesion';
import { hashToken } from '../auth/auth.repository';
import { COOKIE_TERMINAL, ConexionService } from '../terminales/conexion.service';
import { EnVivoService } from './en-vivo.service';

/** El canal del panel (API §8): cada rol recibe lo que puede ver. */
@Controller()
export class EnVivoController {
  constructor(private readonly enVivo: EnVivoService) {}

  @Get('eventos/:eventoId/en-vivo')
  @Permiso('panel.read')
  async openPanel(
    @Contexto() contexto: ContextoEvento,
    @Req() request: RequestConSesion,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.enVivo.open(
      request,
      reply,
      {
        tipo: 'equipo',
        eventoId: contexto.eventoId,
        usuarioId: contexto.usuarioId,
        rol: contexto.rol,
        pantallas: contexto.terminales.pantallas,
        mesas: contexto.terminales.mesas,
      },
      `equipo:${request.sesion?.sessionId ?? contexto.usuarioId}`,
    );
  }
}

/** Los canales de la pantalla y de la mesa, con la sesión de la tablet (`px_terminal`). */
@Controller()
@Publica()
export class EnVivoTerminalController {
  constructor(
    private readonly enVivo: EnVivoService,
    private readonly conexion: ConexionService,
  ) {}

  @Get('sala/en-vivo')
  openSala(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.openTerminal('pantalla', request, reply);
  }

  @Get('mesa/en-vivo')
  openMesa(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.openTerminal('mesa', request, reply);
  }

  private async openTerminal(
    tipo: 'pantalla' | 'mesa',
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const sesion = request.cookies[COOKIE_TERMINAL];
    // Abrir el canal también cuenta como latido.
    const terminal = await this.conexion.beat(sesion);
    if (terminal.tipo !== tipo || !sesion) {
      throw new AppError('TERMINAL_DESCONECTADA');
    }
    const clave = `terminal:${hashToken(sesion).toString('base64url')}`;
    await this.enVivo.open(
      request,
      reply,
      tipo === 'pantalla'
        ? { tipo: 'pantalla', eventoId: terminal.evento.id, pantallaId: terminal.id }
        : { tipo: 'mesa', eventoId: terminal.evento.id, mesaId: terminal.id },
      clave,
    );
  }
}
