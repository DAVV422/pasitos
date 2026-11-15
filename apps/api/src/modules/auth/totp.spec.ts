import {
  buildOtpauthUrl,
  createSecretoTotp,
  decodeBase32,
  encodeBase32,
  generateCodigoTotp,
  getPaso,
  verifyCodigoTotp,
} from './totp';

// RFC 6238, apéndice B: secreto ASCII "12345678901234567890" con SHA-1 (8 dígitos → los 6 últimos).
const SECRETO_RFC = encodeBase32(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('a los %i s el código es %s', (segundos, codigo) => {
    expect(generateCodigoTotp(SECRETO_RFC, getPaso(new Date(segundos * 1000)))).toBe(codigo);
  });

  it('base32 va y vuelve', () => {
    const datos = Buffer.from('hola, pasitos');
    expect(decodeBase32(encodeBase32(datos))).toEqual(datos);
    expect(createSecretoTotp()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('acepta el paso anterior y el siguiente, no los de más lejos', () => {
    const secreto = createSecretoTotp();
    const ahora = new Date('2026-11-15T15:00:10Z');
    const paso = getPaso(ahora);
    for (const delta of [-1, 0, 1]) {
      expect(
        verifyCodigoTotp(secreto, generateCodigoTotp(secreto, paso + delta), ahora, null),
      ).toBe(paso + delta);
    }
    expect(
      verifyCodigoTotp(secreto, generateCodigoTotp(secreto, paso - 2), ahora, null),
    ).toBeNull();
    expect(
      verifyCodigoTotp(secreto, generateCodigoTotp(secreto, paso + 2), ahora, null),
    ).toBeNull();
  });

  it('un código ya usado (o uno anterior) no vale de nuevo', () => {
    const secreto = createSecretoTotp();
    const ahora = new Date('2026-11-15T15:00:10Z');
    const paso = getPaso(ahora);
    const codigo = generateCodigoTotp(secreto, paso);
    expect(verifyCodigoTotp(secreto, codigo, ahora, paso)).toBeNull();
    expect(
      verifyCodigoTotp(secreto, generateCodigoTotp(secreto, paso - 1), ahora, paso),
    ).toBeNull();
    expect(verifyCodigoTotp(secreto, generateCodigoTotp(secreto, paso + 1), ahora, paso)).toBe(
      paso + 1,
    );
  });

  it('rechaza lo que no son 6 números', () => {
    expect(verifyCodigoTotp(createSecretoTotp(), '12345', new Date(), null)).toBeNull();
    expect(verifyCodigoTotp(createSecretoTotp(), 'abcdef', new Date(), null)).toBeNull();
  });

  it('arma el otpauth:// con el emisor y la cuenta', () => {
    expect(buildOtpauthUrl('ABC', 'ana@example.com', 'Pasitos')).toBe(
      'otpauth://totp/Pasitos%3Aana%40example.com?secret=ABC&issuer=Pasitos&algorithm=SHA1&digits=6&period=30',
    );
  });
});
