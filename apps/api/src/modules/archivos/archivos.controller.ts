import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  AppError,
  isPropositoSubible,
  PROPOSITOS_ARCHIVO,
  type PropositoArchivo,
  VARIANTES_IMAGEN,
  type VarianteImagen,
} from '@pasitos/dominio';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { Publica } from '../../common/sesion/sesion';
import { COOKIE_EQUIPO, SesionesService } from '../auth/sesiones.service';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { ArchivosService } from './archivos.service';
import { UbicacionService } from './ubicacion.service';

const esquemaUbicacion = z
  .object({
    nombre: z.string().trim().min(2).max(120),
    direccion: z.string().trim().max(300).default(''),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine((d) => (d.lat == null) === (d.lng == null), {
    error: 'Marca el punto en el mapa o deja los dos campos vacíos.',
    path: ['lat'],
  });

/**
 * Lee el único archivo de un `multipart/form-data` con el límite de su propósito, mientras llega
 * (HU-214 §5). Lo usan la subida de archivos y la importación de invitados (HU-210).
 */
export async function readArchivo(
  request: FastifyRequest,
  proposito: PropositoArchivo,
  archivos: ArchivosService,
): Promise<{ datos: Buffer; nombre: string; mime: string }> {
  if (!request.isMultipart()) {
    throw new AppError('ARCHIVO_INVALIDO', {
      detail: 'Envía el archivo como multipart/form-data.',
    });
  }
  const maximo = PROPOSITOS_ARCHIVO[proposito].maxBytes;
  const parte = await request.file({ limits: { fileSize: maximo, files: 1 } });
  if (!parte) {
    throw new AppError('ARCHIVO_INVALIDO', { detail: 'Falta el archivo.' });
  }
  archivos.checkDeclarado(proposito, parte.filename, parte.mimetype);
  try {
    return { datos: await parte.toBuffer(), nombre: parte.filename, mime: parte.mimetype };
  } catch (error) {
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError('ARCHIVO_MUY_GRANDE', {
        detail: `El archivo supera el máximo de ${maximo / (1024 * 1024)} MB.`,
      });
    }
    throw error;
  }
}

/** Archivos del evento (HU-214, API §4.3) y la ubicación (HU-214 §6). */
@Controller()
export class ArchivosController {
  constructor(
    private readonly archivos: ArchivosService,
    private readonly ubicacion: UbicacionService,
    private readonly sesiones: SesionesService,
  ) {}

  /**
   * `multipart/form-data` con `archivo`; el propósito va en `?proposito=` (o como campo antes del
   * archivo), así el límite de peso se aplica mientras llega, sin esperar el resto.
   */
  @Post('eventos/:eventoId/archivos')
  @Permiso('contenido.update')
  @AccionBitacoraDe('archivo.upload')
  async upload(
    @Contexto() contexto: ContextoEvento,
    @Query('proposito') propositoQuery: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    this.archivos.checkLimite(contexto.usuarioId);
    const proposito = propositoQuery ?? '';
    if (!isPropositoSubible(proposito)) {
      throw new AppError('VALIDACION', {
        errors: [{ field: 'proposito', code: 'NO_VALIDO', message: 'Propósito desconocido.' }],
      });
    }
    return this.archivos.upload(
      contexto,
      proposito,
      await readArchivo(request, proposito, this.archivos),
    );
  }

  @Get('archivos/:id/:variante')
  @Publica()
  async serve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('variante') variante: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!(VARIANTES_IMAGEN as readonly string[]).includes(variante)) {
      throw new AppError('NO_ENCONTRADO');
    }
    const archivo = await this.archivos.open(id, variante as VarianteImagen, () =>
      this.sesiones.authenticate(request.cookies[COOKIE_EQUIPO]).catch(() => null),
    );
    await reply
      .header('Content-Type', 'image/webp')
      .header('Content-Length', String(archivo.tamano))
      .header('Cache-Control', archivo.cacheControl)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', 'inline')
      .send(archivo.stream);
  }

  @Put('eventos/:eventoId/ubicacion')
  @Permiso('evento.update')
  @AccionBitacoraDe('evento.ubicacion.update')
  @HttpCode(200)
  updateUbicacion(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.ubicacion.update(contexto, esquemaUbicacion.parse(cuerpo));
  }
}
