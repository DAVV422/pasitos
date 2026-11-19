import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { AppError, ORIGENES_FOTO, PROPOSITOS_ARCHIVO, type OrigenFoto } from '@pasitos/dominio';
import { hashCuerpo } from '@pasitos/firmas';
import {
  Asistente,
  AsistenteActual,
  type ContextoAsistente,
  type RequestConAsistente,
} from '../../common/sesion/asistente';
import { FotosAppService, type FotoRecibida } from './fotos-app.service';

/**
 * Lee `foto`, `origen` y `autorizaUso` de un `multipart/form-data` (HU-322 §3), con el límite del
 * propósito `foto_reto` mientras llega.
 */
async function readFoto(request: RequestConAsistente): Promise<FotoRecibida> {
  if (!request.isMultipart()) {
    throw new AppError('ARCHIVO_INVALIDO', { detail: 'Envía la foto como multipart/form-data.' });
  }
  const maximo = PROPOSITOS_ARCHIVO.foto_reto.maxBytes;
  const campos: Record<string, string> = {};
  let archivo: { datos: Buffer; nombre: string; mime: string } | null = null;
  try {
    for await (const parte of request.parts({
      limits: { fileSize: maximo, files: 1, fields: 5 },
    })) {
      if (parte.type === 'file') {
        if (parte.fieldname !== 'foto' || archivo) {
          await parte.toBuffer();
          continue;
        }
        archivo = { datos: await parte.toBuffer(), nombre: parte.filename, mime: parte.mimetype };
      } else {
        campos[parte.fieldname] = String(parte.value);
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError('ARCHIVO_MUY_GRANDE', {
        detail: `La foto supera el máximo de ${maximo / (1024 * 1024)} MB.`,
      });
    }
    throw error;
  }
  if (!archivo) throw new AppError('ARCHIVO_INVALIDO', { detail: 'Falta la foto.' });
  const origen = campos['origen'];
  if (!(ORIGENES_FOTO as readonly string[]).includes(origen ?? '')) {
    throw new AppError('VALIDACION', {
      errors: [{ field: 'origen', code: 'NO_VALIDO', message: 'Indica cámara o galería.' }],
    });
  }
  return {
    ...archivo,
    origen: origen as OrigenFoto,
    autorizaUso: campos['autorizaUso'] === 'true',
  };
}

/** Las fotos de los retos desde la app (HU-322). */
@Controller('app')
export class FotosAppController {
  constructor(private readonly fotos: FotosAppService) {}

  /** Firmado sobre el SHA-256 del archivo (no del cuerpo), con `Idempotency-Key`. Responde `202`. */
  @Post('retos/:id/fotos')
  @Asistente({ firmaDeArchivo: true, momento: 'foto' })
  @HttpCode(202)
  async submit(
    @AsistenteActual() asistente: ContextoAsistente,
    @Param('id', new ParseUUIDPipe()) retoId: string,
    @Req() request: RequestConAsistente,
  ) {
    const foto = await readFoto(request);
    if (!request.verifyFirmaArchivo) throw new AppError('ERROR_INTERNO');
    const firma = await request.verifyFirmaArchivo(await hashCuerpo(new Uint8Array(foto.datos)));
    return this.fotos.submit(asistente, retoId, foto, firma);
  }
}
