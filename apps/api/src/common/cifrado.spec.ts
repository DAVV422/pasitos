import { randomBytes } from 'node:crypto';
import { buildCifrador, Cifrador, parseLlaveCifrado } from './cifrado';

const llave = (version: number) => ({ version, llave: randomBytes(32) });

describe('Cifrador (AES-256-GCM)', () => {
  it('cifra y descifra; el mismo texto da bytes distintos cada vez', () => {
    const cifrador = new Cifrador(llave(1));
    const a = cifrador.encrypt('secreto TOTP');
    const b = cifrador.encrypt('secreto TOTP');
    expect(a.equals(b)).toBe(false);
    expect(a[0]).toBe(1);
    expect(cifrador.decryptTexto(a)).toBe('secreto TOTP');
  });

  it('con la llave rotada, sigue leyendo lo cifrado con la anterior', () => {
    const vieja = llave(1);
    const antes = new Cifrador(vieja).encrypt('dato viejo');
    const despues = new Cifrador(llave(2), [vieja]);
    expect(despues.decryptTexto(antes)).toBe('dato viejo');
    expect(despues.encrypt('dato nuevo')[0]).toBe(2);
  });

  it('falla si el dato se modificó o la llave no existe', () => {
    const cifrador = new Cifrador(llave(1));
    const cifrado = cifrador.encrypt('x');
    cifrado[cifrado.length - 1] = (cifrado[cifrado.length - 1] ?? 0) ^ 1;
    expect(() => cifrador.decrypt(cifrado)).toThrow();
    expect(() => new Cifrador(llave(3)).decrypt(new Cifrador(llave(1)).encrypt('x'))).toThrow(
      'llave desconocida',
    );
  });

  it('lee la llave con o sin versión y exige 32 bytes', () => {
    const base64 = randomBytes(32).toString('base64');
    expect(parseLlaveCifrado(base64).version).toBe(1);
    expect(parseLlaveCifrado(`4:${base64}`).version).toBe(4);
    expect(() => parseLlaveCifrado(randomBytes(16).toString('base64'))).toThrow('32 bytes');
    expect(buildCifrador(`2:${base64}`, '').encrypt('x')[0]).toBe(2);
  });
});
