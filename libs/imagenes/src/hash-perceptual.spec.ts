import sharp from 'sharp';
import { getDistanciaHash, getHashPerceptual } from './hash-perceptual';

/** Una imagen de prueba: un degradado con un círculo, para que tenga forma. */
async function newImagen(semilla: number, ancho = 800): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${ancho}">
<defs><linearGradient id="g"><stop offset="0" stop-color="#${semilla.toString(16).padStart(6, '0')}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${(semilla % 5) * 120 + 150}" cy="${(semilla % 3) * 180 + 200}" r="140" fill="#000000"/>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

describe('dHash (HU-322)', () => {
  it('igual a sí misma, cerca de una versión recomprimida y achicada, lejos de otra foto', async () => {
    const foto = await newImagen(0x2266aa);
    const hash = await getHashPerceptual(foto);
    expect(hash).toHaveLength(8);
    expect(getDistanciaHash(hash, await getHashPerceptual(foto))).toBe(0);
    const recomprimida = await sharp(foto).resize(500).jpeg({ quality: 40 }).toBuffer();
    expect(getDistanciaHash(hash, await getHashPerceptual(recomprimida))).toBeLessThanOrEqual(6);
    const otra = await newImagen(0xaa2211);
    expect(getDistanciaHash(hash, await getHashPerceptual(otra))).toBeGreaterThan(6);
  });
});
