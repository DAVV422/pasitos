import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';

/**
 * Archivos de prueba para V23 (HU-214, Subida de archivos §7), **generados** en cada corrida: no
 * hay binarios hechos a mano en el repositorio.
 */
export function createImagen(
  formato: 'png' | 'jpeg' | 'webp',
  ancho = 800,
  alto = 600,
): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: '#d97706' } })
    .toFormat(formato)
    .toBuffer();
}

/** Un JPEG con la ubicación GPS de "una foto de celular". */
export function createJpegConGps(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: '#047857' } })
    .withExif({
      IFD0: { Make: 'Celular de prueba', Model: 'Modelo X' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '16/1 30/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '68/1 9/1 0/1',
      },
    })
    .jpeg()
    .toBuffer();
}

/** La cabecera de un ejecutable de Windows (MZ…PE), con la extensión de una imagen. */
export function createEjecutable(): Buffer {
  const datos = Buffer.alloc(512);
  datos.write('MZ', 0, 'latin1');
  datos.writeUInt32LE(0x80, 0x3c);
  datos.write('PE\0\0', 0x80, 'latin1');
  return datos;
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Bomba de descompresión: un PNG de ~1 KB que declara 50 000 × 50 000 píxeles. */
export function createBomba(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(50_000, 0);
  ihdr.writeUInt32BE(50_000, 4);
  ihdr.writeUInt8(8, 8); // profundidad
  ihdr.writeUInt8(0, 9); // escala de grises
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(1_000))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const SVG_CON_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>',
);

/** Un ZIP mínimo (con su firma `PK`), para pegarlo al final de una imagen válida. */
export const ZIP_PEGADO = Buffer.concat([
  Buffer.from('PK\x03\x04', 'latin1'),
  Buffer.from('programa-escondido.exe con un contenido cualquiera'),
]);

/** Arma un cuerpo multipart/form-data con un solo archivo. */
export function buildMultipart(nombre: string, mime: string, datos: Buffer) {
  const limite = '----pasitos-prueba';
  const cabecera = Buffer.from(
    `--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  return {
    payload: Buffer.concat([cabecera, datos, Buffer.from(`\r\n--${limite}--\r\n`)]),
    contentType: `multipart/form-data; boundary=${limite}`,
  };
}
