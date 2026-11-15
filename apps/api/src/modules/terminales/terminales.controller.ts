import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  esquemaConectar,
  esquemaEditarMesa,
  esquemaEditarPantalla,
  esquemaGenerarConexion,
  esquemaMesa,
  esquemaPantalla,
} from '@pasitos/dominio/esquemas';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { Publica } from '../../common/sesion/sesion';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { COOKIE_TERMINAL, ConexionService } from './conexion.service';
import { TerminalesService } from './terminales.service';

function pick<T extends object>(datos: T, cuerpo: unknown): Partial<T> {
  const enviados = new Set(Object.keys((cuerpo ?? {}) as object));
  return Object.fromEntries(
    Object.entries(datos).filter(([campo]) => enviados.has(campo)),
  ) as Partial<T>;
}

/** Pantallas y mesas desde el panel (HU-209 §2, API §4.4). */
@Controller()
export class TerminalesController {
  constructor(private readonly terminales: TerminalesService) {}

  @Get('eventos/:eventoId/pantallas')
  @Permiso('terminales.read')
  async listPantallas(@Contexto() contexto: ContextoEvento) {
    return {
      items: await this.terminales.listPantallas(contexto),
      pagination: { nextCursor: null },
    };
  }

  @Post('eventos/:eventoId/pantallas')
  @Permiso('terminales.update')
  @AccionBitacoraDe('pantalla.create')
  createPantalla(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.terminales.createPantalla(contexto, esquemaPantalla.parse(cuerpo));
  }

  @Patch('pantallas/:id')
  @Permiso('terminales.update', { recurso: 'pantallas' })
  @AccionBitacoraDe('pantalla.update')
  @HttpCode(204)
  async updatePantalla(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.terminales.updatePantalla(
      contexto,
      id,
      pick(esquemaEditarPantalla.parse(cuerpo), cuerpo),
    );
  }

  @Post('pantallas/:id/conexion')
  @Permiso('terminales.update', { recurso: 'pantallas' })
  @AccionBitacoraDe('pantalla.connect')
  createConexionPantalla(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    const { motivo } = esquemaGenerarConexion.parse(cuerpo ?? {});
    return this.terminales.createConexion(contexto, 'pantalla', id, motivo);
  }

  @Delete('pantallas/:id/conexion')
  @Permiso('terminales.update', { recurso: 'pantallas' })
  @AccionBitacoraDe('pantalla.disconnect')
  @HttpCode(204)
  async disconnectPantalla(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.terminales.disconnect(contexto, 'pantalla', id);
  }

  @Get('eventos/:eventoId/mesas')
  @Permiso('terminales.read')
  async listMesas(@Contexto() contexto: ContextoEvento) {
    return { items: await this.terminales.listMesas(contexto), pagination: { nextCursor: null } };
  }

  @Post('eventos/:eventoId/mesas')
  @Permiso('terminales.update')
  @AccionBitacoraDe('mesa.create')
  createMesa(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.terminales.createMesa(contexto, esquemaMesa.parse(cuerpo));
  }

  @Patch('mesas/:id')
  @Permiso('terminales.update', { recurso: 'mesas' })
  @AccionBitacoraDe('mesa.update')
  @HttpCode(204)
  async updateMesa(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.terminales.updateMesa(contexto, id, pick(esquemaEditarMesa.parse(cuerpo), cuerpo));
  }

  @Post('mesas/:id/conexion')
  @Permiso('terminales.update', { recurso: 'mesas' })
  @AccionBitacoraDe('mesa.connect')
  createConexionMesa(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.terminales.createConexion(contexto, 'mesa', id, undefined);
  }

  @Delete('mesas/:id/conexion')
  @Permiso('terminales.update', { recurso: 'mesas' })
  @AccionBitacoraDe('mesa.disconnect')
  @HttpCode(204)
  async disconnectMesa(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.terminales.disconnect(contexto, 'mesa', id);
  }
}

/** Las terminales: conectarse con el token y avisar que siguen en línea (HU-209 §2). */
@Controller('terminales')
@Publica()
export class ConexionController {
  constructor(
    private readonly conexion: ConexionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('conectar')
  @HttpCode(200)
  async connect(
    @Body() cuerpo: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const datos = esquemaConectar.parse(cuerpo);
    const { sesion, terminal } = await this.conexion.connect(
      datos.token,
      datos.llavePublica,
      request.ip,
    );
    void reply.setCookie(COOKIE_TERMINAL, sesion, {
      httpOnly: true,
      secure: this.config.PUBLIC_URL.startsWith('https://'),
      sameSite: 'lax',
      path: '/api',
      // La tablet queda conectada hasta que la desconecten (o se borren los datos del navegador).
      maxAge: 60 * 60 * 24 * 30,
    });
    return terminal;
  }

  @Post('latido')
  @HttpCode(200)
  beat(@Req() request: FastifyRequest) {
    return this.conexion.beat(request.cookies[COOKIE_TERMINAL]);
  }
}
