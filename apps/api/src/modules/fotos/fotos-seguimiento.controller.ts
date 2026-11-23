import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { AppError, VARIANTES_IMAGEN, type VarianteImagen } from '@pasitos/dominio';
import { esquemaDescargarFotos, esquemaListarFotos } from '@pasitos/dominio/esquemas';
import type { FastifyReply } from 'fastify';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { Asistente, AsistenteActual, type ContextoAsistente } from '../../common/sesion/asistente';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { OperacionesService } from '../invitados/operaciones.service';
import { FotosSeguimientoService } from './fotos-seguimiento.service';

function checkVariante(variante: string): VarianteImagen {
  if (!(VARIANTES_IMAGEN as readonly string[]).includes(variante)) {
    throw new AppError('NO_ENCONTRADO');
  }
  return variante as VarianteImagen;
}

/** El seguimiento de las fotos en el panel (HU-324 §1). */
@Controller()
export class FotosSeguimientoController {
  constructor(
    private readonly seguimiento: FotosSeguimientoService,
    private readonly operaciones: OperacionesService,
  ) {}

  /** D y C, todas; los responsables, las de sus retos (lo decide el servicio). */
  @Get('eventos/:eventoId/fotos')
  @Permiso('evento.read')
  list(@Contexto() contexto: ContextoEvento, @Query() query: unknown) {
    return this.seguimiento.list(contexto, esquemaListarFotos.parse(query));
  }

  @Get('asistentes/:id/fotos')
  @Permiso('bitacora.read', { recurso: 'asistentes' })
  listDeAsistente(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.seguimiento.listDeAsistente(contexto, id);
  }

  /**
   * *Descargar para redes*: la operación `export-fotos`; el enlace sale de `GET /operaciones/:id`.
   * Todas (cada reto en su carpeta) o las de un reto. También con el evento cerrado: no cambia nada.
   */
  @Post('eventos/:eventoId/fotos/descargas')
  @Permiso('fotos.descargar')
  @AccionBitacoraDe('foto.descargar')
  @HttpCode(202)
  createDescarga(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    const { retoId } = esquemaDescargarFotos.parse(cuerpo ?? {});
    return this.operaciones.createExportacionFotos(contexto, contexto.usuarioId, 'panel', retoId);
  }
}

/** *Mis fotos* en la app (HU-324 §1). */
@Controller('app/fotos')
export class FotosAppSeguimientoController {
  constructor(private readonly seguimiento: FotosSeguimientoService) {}

  @Get()
  @Asistente()
  list(@AsistenteActual() asistente: ContextoAsistente) {
    return this.seguimiento.listMias(asistente);
  }

  @Get(':id/imagen/:variante')
  @Asistente()
  async open(
    @AsistenteActual() asistente: ContextoAsistente,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('variante') variante: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { stream, tamano } = await this.seguimiento.openMia(
      asistente,
      id,
      checkVariante(variante),
    );
    void reply
      .header('Content-Type', 'image/webp')
      .header('Content-Length', String(tamano))
      .header('Cache-Control', 'private, no-store');
    return reply.send(stream);
  }

  /** Firmado: la persona la saca de las descargas siguientes. */
  @Post(':id/retirar-autorizacion')
  @Asistente({ firmado: true })
  @HttpCode(200)
  withdraw(
    @AsistenteActual() asistente: ContextoAsistente,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.seguimiento.withdrawAutorizacion(asistente, id);
  }
}
