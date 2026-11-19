import { CALIDAD_FOTO_CELULAR, getMedidasAchicadas, LADO_FOTO_CELULAR } from '@pasitos/dominio';

/**
 * Achica una foto en el celular antes de subirla (HU-322 §5): respeta la orientación de la cámara,
 * deja el lado mayor en 1600 px y la vuelve a codificar en JPEG al 0,8. El canvas no copia los
 * metadatos: la ubicación GPS no sale del celular. Suele quedar entre 250 y 400 KB.
 */
export async function achicarImagen(
  archivo: Blob,
  ladoMaximo = LADO_FOTO_CELULAR,
  calidad = CALIDAD_FOTO_CELULAR,
): Promise<Blob> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  try {
    const { ancho, alto } = getMedidasAchicadas(imagen.width, imagen.height, ladoMaximo);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Este navegador no puede preparar la foto.');
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    return await new Promise<Blob>((listo, falla) =>
      canvas.toBlob(
        (blob) => (blob ? listo(blob) : falla(new Error('No pudimos preparar la foto.'))),
        'image/jpeg',
        calidad,
      ),
    );
  } finally {
    imagen.close();
  }
}
