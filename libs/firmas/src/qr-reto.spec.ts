import { describe, expect, it } from 'vitest';
import { createParLlaves } from './llaves';
import { buildQrReto, getFranjaQr, parseQrReto, verifyQrReto } from './qr-reto';

/** Vectores compartidos por la pantalla (HU-314) y el reclamo (HU-310). */
describe('QR de reto PX1', () => {
  it('se arma con JCS y se verifica con la llave de la pantalla, también como enlace', async () => {
    const par = await createParLlaves();
    const qr = await buildQrReto(par.privateKey, { p: 2, r: 7, e: 3, f: 20431 });
    expect(qr).toMatch(/^PX1\.[\w-]+\.[\w-]{86}$/);
    const leido = parseQrReto(`https://pasitos.example.com/r/${qr}`);
    expect(leido?.datos).toEqual({ p: 2, r: 7, e: 3, f: 20431 });
    expect(new TextDecoder().decode(leido?.mensaje)).toBe('{"e":3,"f":20431,"p":2,"r":7}');
    expect(await verifyQrReto(par.publicKey, leido ?? (null as never))).toBe(true);
  });

  it('de un solo uso, con nonce', async () => {
    const par = await createParLlaves();
    const qr = await buildQrReto(par.privateKey, { p: 1, r: 4, e: 0, u: 'aB3dE5fG7hJ9kL1mN3pQ5r' });
    const leido = parseQrReto(qr);
    expect(leido?.datos).toEqual({ p: 1, r: 4, e: 0, u: 'aB3dE5fG7hJ9kL1mN3pQ5r' });
    expect(await verifyQrReto(par.publicKey, leido ?? (null as never))).toBe(true);
  });

  it('sin la llave de la pantalla, o alterado, no verifica', async () => {
    const pantalla = await createParLlaves();
    const otra = await createParLlaves();
    const qr = await buildQrReto(otra.privateKey, { p: 2, r: 7, e: 3, f: 1 });
    expect(await verifyQrReto(pantalla.publicKey, parseQrReto(qr) ?? (null as never))).toBe(false);

    const bueno = await buildQrReto(pantalla.privateKey, { p: 2, r: 7, e: 3, f: 1 });
    const [prefijo, , firma] = bueno.split('.');
    const otrosDatos = Buffer.from('{"e":3,"f":2,"p":2,"r":7}').toString('base64url');
    const alterado = parseQrReto(`${prefijo}.${otrosDatos}.${firma}`);
    expect(await verifyQrReto(pantalla.publicKey, alterado ?? (null as never))).toBe(false);
  });

  it('rechaza lo que no tiene la forma: otro texto, campos de más, orden no canónico', () => {
    expect(parseQrReto('Hola')).toBeNull();
    expect(parseQrReto('PXE1.abc.1.def')).toBeNull();
    const conExtra = Buffer.from('{"e":3,"f":2,"p":2,"r":7,"x":1}').toString('base64url');
    expect(parseQrReto(`PX1.${conExtra}.firma`)).toBeNull();
    const desordenado = Buffer.from('{"r":7,"p":2,"f":2,"e":3}').toString('base64url');
    expect(parseQrReto(`PX1.${desordenado}.firma`)).toBeNull();
    const ambos = Buffer.from('{"e":3,"f":2,"p":2,"r":7,"u":"aB3dE5fG7hJ9kL1mN3pQ5r"}').toString(
      'base64url',
    );
    expect(parseQrReto(`PX1.${ambos}.firma`)).toBeNull();
  });

  it('la franja usa la hora del servidor', () => {
    expect(getFranjaQr(30_000 * 20431 + 29_999, 30)).toBe(20431);
    expect(getFranjaQr(30_000 * 20432, 30)).toBe(20432);
  });
});
