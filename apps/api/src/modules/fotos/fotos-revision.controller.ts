import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { AppError, VARIANTES_IMAGEN, type VarianteImagen } from '@pasitos/dominio';
import {
  esquemaAnularFoto,
  esquemaRechazarFoto,
  esquemaSiguienteFoto,
} from '@pasitos/dominio/esquemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { getPedidoIdempotente } from '../acceso/idempotencia';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { FotosRevisionService } from './fotos-revision.service';

type RequestConCuerpo = FastifyRequest & { rawBody?: Buffer };

/**
 * Revisar las fotos (HU-323 §2). `fotos.review` es de D y C, y además cada responsable revisa
 * solo sus retos: las rutas piden ser del evento y el servicio decide en cada una (lo ajeno
 * responde `404`, sin revelar que existe). Deshacer es de D y C.
 */
@Controller()
export class FotosRevisionController {
  constructor(private readonly revision: FotosRevisionService) {}

  @Get('eventos/:eventoId/fotos/pendientes')
  @Permiso('evento.read')
  pendientes(@Contexto() contexto: ContextoEvento, @Query('reto') reto?: string) {
    return this.revision.pendientes(contexto, reto);
  }

  @Post('eventos/:eventoId/fotos/siguiente')
  @Permiso('evento.read')
  async next(
    @Contexto() contexto: ContextoEvento,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const foto = await this.revision.next(
      contexto,
      esquemaSiguienteFoto.parse(cuerpo ?? {}).retoId,
    );
    if (!foto) {
      void reply.status(204);
      return undefined;
    }
    void reply.status(200);
    return foto;
  }

  @Get('fotos/:id/imagen/:variante')
  @Permiso('evento.read', { recurso: 'fotos' })
  async open(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('variante') variante: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!(VARIANTES_IMAGEN as readonly string[]).includes(variante)) {
      throw new AppError('NO_ENCONTRADO');
    }
    const { stream, tamano } = await this.revision.open(contexto, id, variante as VarianteImagen);
    void reply
      .header('Content-Type', 'image/webp')
      .header('Content-Length', String(tamano))
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff');
    return reply.send(stream);
  }

  @Post('fotos/:id/aprobar')
  @Permiso('evento.read', { recurso: 'fotos' })
  @HttpCode(200)
  approve(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: RequestConCuerpo,
  ) {
    return this.revision.approve(contexto, id, getPedidoIdempotente(request));
  }

  @Post('fotos/:id/rechazar')
  @Permiso('evento.read', { recurso: 'fotos' })
  @HttpCode(200)
  reject(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.revision.reject(contexto, id, esquemaRechazarFoto.parse(cuerpo));
  }

  @Post('fotos/:id/soltar')
  @Permiso('evento.read', { recurso: 'fotos' })
  @HttpCode(204)
  async release(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.revision.release(contexto, id);
  }

  @Post('fotos/:id/anular')
  @Permiso('puntos.ajustar', { recurso: 'fotos' })
  @AccionBitacoraDe('foto.anular')
  @HttpCode(200)
  cancel(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    return this.revision.cancel(
      contexto,
      id,
      esquemaAnularFoto.parse(cuerpo).motivo,
      getPedidoIdempotente(request),
    );
  }
}
