import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppError, PROPOSITOS_ARCHIVO, type PropositoArchivo } from '@pasitos/dominio';

/** Una sola imagen a la vez por request, y como mucho dos en todo el proceso (HU-214 §2). */
sharp.concurrency(1);
const MAXIMO_A_LA_VEZ = 2;
let enCurso = 0;
const enEspera: (() => void)[] = [];

async function withTurno<T>(trabajo: () => Promise<T>): Promise<T> {
  if (enCurso >= MAXIMO_A_LA_VEZ) {
    await new Promise<void>((listo) => enEspera.push(listo));
  }
  enCurso += 1;
  try {
    return await trabajo();
  } finally {
    enCurso -= 1;
    enEspera.shift()?.();
  }
}

export interface ImagenProcesada {
  readonly ancho: number;
  readonly alto: number;
  readonly sha256: string;
  /** WebP nuevos, sin metadatos: `original`, `1200` y `400` (sin agrandar). */
  readonly variantes: {
    readonly original: Buffer;
    readonly '1200': Buffer;
    readonly '400': Buffer;
  };
}

const TIPOS_IMAGEN = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Pasos 2 a 4 de Subida de archivos §2 para una imagen. Pasitos lee **solo los píxeles** y crea un
 * archivo nuevo: un políglota o un programa pegado al final no llegan a nadie, ni el EXIF (GPS).
 */
export async function processImagen(
  datos: Buffer,
  proposito: PropositoArchivo,
): Promise<ImagenProcesada> {
  // 2 · Tipo real, por los bytes del inicio (no por la extensión).
  const tipo = await fileTypeFromBuffer(datos);
  if (!tipo || !TIPOS_IMAGEN.has(tipo.mime)) {
    throw new AppError('ARCHIVO_TIPO_NO_PERMITIDO');
  }
  const maxLado = PROPOSITOS_ARCHIVO[proposito].maxLado;
  return withTurno(async () => {
    // 3 · Sano: medidas declaradas, límite de píxeles (bombas) y decodificación completa.
    const opciones = { limitInputPixels: maxLado * maxLado, failOn: 'error' as const };
    let metadatos;
    try {
      metadatos = await sharp(datos, opciones).metadata();
    } catch (error) {
      throw toErrorImagen(error);
    }
    const ancho = metadatos.width ?? 0;
    const alto = metadatos.height ?? 0;
    if (ancho > maxLado || alto > maxLado) {
      throw new AppError('ARCHIVO_MUY_GRANDE', {
        detail: `La imagen mide ${ancho} × ${alto} px: el máximo es ${maxLado} × ${maxLado}.`,
      });
    }
    try {
      await sharp(datos, opciones).stats();
    } catch (error) {
      throw toErrorImagen(error);
    }
    // 4 · Procesar: orientación EXIF aplicada, WebP 82 sin metadatos (sharp no los copia).
    const base = () => sharp(datos, opciones).rotate();
    const original = await base().webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const reducida = (ancho: number) =>
      base().resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const [de1200, de400] = await Promise.all([reducida(1200), reducida(400)]);
    return {
      ancho: original.info.width,
      alto: original.info.height,
      sha256: createHash('sha256').update(original.data).digest('hex'),
      variantes: { original: original.data, '1200': de1200, '400': de400 },
    };
  });
}

function toErrorImagen(error: unknown): AppError {
  const mensaje = error instanceof Error ? error.message : String(error);
  // sharp avisa así que se pasó el límite de píxeles: es una bomba de descompresión.
  return /pixel limit/i.test(mensaje)
    ? new AppError('ARCHIVO_MUY_GRANDE', { detail: 'La imagen tiene demasiados píxeles.' })
    : new AppError('ARCHIVO_CORRUPTO');
}

/**
 * CSV de invitados (HU-214 §5): sin bytes nulos ni firmas binarias en el primer KB, y UTF-8 válido
 * (con o sin BOM). No se procesa como imagen: queda en cuarentena para la importación (HU-210).
 */
export async function checkCsv(datos: Buffer): Promise<void> {
  const inicio = datos.subarray(0, 1024);
  const binario = inicio.includes(0) || (await fileTypeFromBuffer(inicio)) !== undefined;
  let utf8 = true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    utf8 = false;
  }
  if (binario || !utf8) {
    throw new AppError('ARCHIVO_TIPO_NO_PERMITIDO', {
      detail:
        'Guarda el archivo como «CSV UTF-8» (en Excel: Guardar como → CSV UTF-8) y vuelve a subirlo.',
    });
  }
}
