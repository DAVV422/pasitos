import { detectRedEnlace, getEtiquetaEnlace, splitTextoConEnlaces } from './enlaces';

describe('Enlaces de un reto', () => {
  it('detecta Facebook, Instagram, TikTok, X y otros sitios web por dominio', () => {
    expect(detectRedEnlace('https://www.facebook.com/pasitos/posts/123')).toBe('facebook');
    expect(detectRedEnlace('https://fb.watch/abc123/')).toBe('facebook');
    expect(detectRedEnlace('https://instagram.com/p/ABC123/')).toBe('instagram');
    expect(detectRedEnlace('https://vm.tiktok.com/ZM12345/')).toBe('tiktok');
    expect(detectRedEnlace('https://x.com/pasitos/status/123')).toBe('x');
    expect(detectRedEnlace('https://twitter.com/pasitos')).toBe('x');
    expect(detectRedEnlace('https://pasitos.bo/evento')).toBe('web');
  });

  it('usa la etiqueta personalizada o el nombre de la red por defecto', () => {
    expect(getEtiquetaEnlace({ url: 'https://www.instagram.com/pasitos', etiqueta: null })).toBe(
      'Instagram',
    );
    expect(
      getEtiquetaEnlace({
        url: 'https://www.instagram.com/p/123',
        etiqueta: 'Ver publicación',
      }),
    ).toBe('Ver publicación');
  });

  it('separa un texto con enlaces https:// respetando saltos de línea y puntuación final', () => {
    const texto =
      'Síguenos en https://instagram.com/pasitos, comenta en https://x.com/pasitos/status/1). ¡Gracias!';
    expect(splitTextoConEnlaces(texto)).toEqual([
      { tipo: 'texto', texto: 'Síguenos en ' },
      {
        tipo: 'enlace',
        texto: 'https://instagram.com/pasitos',
        url: 'https://instagram.com/pasitos',
      },
      { tipo: 'texto', texto: ', comenta en ' },
      {
        tipo: 'enlace',
        texto: 'https://x.com/pasitos/status/1',
        url: 'https://x.com/pasitos/status/1',
      },
      { tipo: 'texto', texto: '). ¡Gracias!' },
    ]);
  });

  it('devuelve un solo fragmento de texto cuando no hay enlaces', () => {
    expect(splitTextoConEnlaces('Escanea el QR al final de la charla.')).toEqual([
      { tipo: 'texto', texto: 'Escanea el QR al final de la charla.' },
    ]);
  });
});
