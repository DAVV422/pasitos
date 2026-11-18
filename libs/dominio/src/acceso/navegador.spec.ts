import { getNavegador, isCelular, isNavegadorDeOtraApp, isNavegadorSoportado } from './navegador';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  chromeViejo:
    'Mozilla/5.0 (Linux; Android 9; SM-J400M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneViejo:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  instagram:
    'Mozilla/5.0 (Linux; Android 14; SM-A145M Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Instagram 355.0.0.0',
  whatsappIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ie: 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
};

describe('Navegadores (D42)', () => {
  it('reconoce el navegador y su versión', () => {
    expect(getNavegador(UA.chromeAndroid)).toEqual({ nombre: 'chrome', version: 131 });
    expect(getNavegador(UA.iphone)).toEqual({ nombre: 'safari', version: 17.5 });
    expect(getNavegador(UA.chromeIphone)).toEqual({ nombre: 'safari', version: 17.5 });
    expect(getNavegador(UA.samsung)).toEqual({ nombre: 'samsung', version: 25 });
  });

  it('acepta los soportados y rechaza los viejos, IE y los de otras apps', () => {
    expect(isNavegadorSoportado(UA.chromeAndroid)).toBe(true);
    expect(isNavegadorSoportado(UA.iphone)).toBe(true);
    expect(isNavegadorSoportado(UA.samsung)).toBe(true);
    expect(isNavegadorSoportado(UA.chromeViejo)).toBe(false);
    expect(isNavegadorSoportado(UA.iphoneViejo)).toBe(false);
    expect(isNavegadorSoportado(UA.ie)).toBe(false);
    expect(isNavegadorSoportado(UA.instagram)).toBe(false);
    expect(isNavegadorSoportado('un navegador nuevo')).toBe(true);
  });

  it('detecta los navegadores dentro de otras apps', () => {
    expect(isNavegadorDeOtraApp(UA.instagram)).toBe(true);
    expect(isNavegadorDeOtraApp(UA.whatsappIphone)).toBe(true);
    expect(isNavegadorDeOtraApp(UA.chromeAndroid)).toBe(false);
    expect(isNavegadorDeOtraApp(UA.iphone)).toBe(false);
  });

  it('distingue el celular de la computadora (el iPad por la pantalla táctil)', () => {
    expect(isCelular(UA.chromeAndroid)).toBe(true);
    expect(isCelular(UA.iphone)).toBe(true);
    expect(isCelular(UA.windows)).toBe(false);
    expect(isCelular(UA.ipadOs, 0)).toBe(false);
    expect(isCelular(UA.ipadOs, 5)).toBe(true);
  });
});
