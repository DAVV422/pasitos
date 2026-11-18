import { randomBytes } from 'node:crypto';
import { buildCifrador } from '@pasitos/db';
import {
  buildPermisoRegistro,
  buildUrlRotativo,
  isFirmaFranja,
  parseCodigoRotativo,
  readPermisoRegistro,
  signFranja,
} from './firma-registro';

const QR = '01a1f054-68d8-7f01-8d1a-dfba7045a700';

describe('firmas del QR de registro (HU-319)', () => {
  const secreto = randomBytes(32);

  it('la franja firmada se verifica, y no sirve con otro secreto, otro QR u otra franja', () => {
    const firma = signFranja(secreto, QR, 1_000);
    expect(firma).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isFirmaFranja(secreto, QR, 1_000, firma)).toBe(true);
    expect(isFirmaFranja(randomBytes(32), QR, 1_000, firma)).toBe(false);
    expect(isFirmaFranja(secreto, QR.replace('a700', 'a701'), 1_000, firma)).toBe(false);
    expect(isFirmaFranja(secreto, QR, 1_001, firma)).toBe(false);
    expect(isFirmaFranja(secreto, QR, 1_000, 'corta')).toBe(false);
  });

  it('la URL del rotativo se vuelve a leer', () => {
    const { url, franja } = buildUrlRotativo(
      'https://pasitos.example.com',
      QR,
      secreto,
      30_000 * 7,
    );
    expect(franja).toBe(7);
    const codigo = url.split('/app/registro/r/')[1] ?? '';
    expect(parseCodigoRotativo(codigo)).toEqual({
      qrId: QR,
      franja: 7,
      firma: signFranja(secreto, QR, 7),
    });
    expect(parseCodigoRotativo('otra-cosa')).toBeNull();
    expect(parseCodigoRotativo(`${QR}.x.${signFranja(secreto, QR, 7)}`)).toBeNull();
  });

  it('el permiso de registro dura 10 minutos y no se puede inventar', () => {
    const cifrador = buildCifrador(randomBytes(32).toString('base64'), '');
    const ahora = Date.parse('2026-11-21T14:00:00Z');
    const { valor } = buildPermisoRegistro(cifrador, { qrId: QR, organizacionId: 'org' }, ahora);
    expect(readPermisoRegistro(cifrador, valor, ahora + 9 * 60_000)).toMatchObject({
      qrId: QR,
      organizacionId: 'org',
    });
    expect(readPermisoRegistro(cifrador, valor, ahora + 10 * 60_000)).toBeNull();
    const otro = buildCifrador(randomBytes(32).toString('base64'), '');
    expect(readPermisoRegistro(otro, valor, ahora)).toBeNull();
    expect(readPermisoRegistro(cifrador, 'inventado', ahora)).toBeNull();
    expect(readPermisoRegistro(cifrador, undefined, ahora)).toBeNull();
  });
});
