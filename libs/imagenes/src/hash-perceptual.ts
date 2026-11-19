import sharp from 'sharp';

/**
 * dHash de 64 bits (HU-322 §4): la imagen en grises de 9 × 8 y, por fila, si cada píxel es más
 * claro que el siguiente. Dos fotos iguales o casi (recomprimidas, achicadas) quedan a pocos bits;
 * dos distintas, lejos. Sirve para la alerta A11, nunca como prueba.
 */
export async function getHashPerceptual(datos: Buffer): Promise<Buffer> {
  const pixeles = await sharp(datos)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  const hash = Buffer.alloc(8);
  for (let fila = 0; fila < 8; fila += 1) {
    let byte = 0;
    for (let columna = 0; columna < 8; columna += 1) {
      const izquierda = pixeles[fila * 9 + columna] ?? 0;
      const derecha = pixeles[fila * 9 + columna + 1] ?? 0;
      byte = (byte << 1) | (izquierda > derecha ? 1 : 0);
    }
    hash[fila] = byte;
  }
  return hash;
}

/** Cuántos bits distintos tienen dos hashes (distancia de Hamming). */
export function getDistanciaHash(a: Buffer, b: Buffer): number {
  let distancia = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    let x = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (x) {
      distancia += x & 1;
      x >>= 1;
    }
  }
  return distancia;
}
