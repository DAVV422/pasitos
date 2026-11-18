import { randomBytes } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { buildQrEntrada, buildQrEntradaFija, FRANJA_ENTRADA_MS, verifyQrEntrada } from './entrada';

describe('el QR de Mi entrada (PXE1, HU-311 §1)', () => {
  const llave = randomBytes(32);
  const asistenteId = uuidv7();
  const ahora = Date.UTC(2026, 10, 21, 14, 0, 10);

  it('tiene el formato PXE1 y se lee en su franja y en la siguiente', () => {
    const { qr, validoHasta } = buildQrEntrada(llave, asistenteId, ahora);
    expect(qr).toMatch(/^PXE1\.[\w-]{22}\.\d+\.[\w-]{22}$/);
    expect(verifyQrEntrada(llave, qr, ahora)).toEqual({ valido: true, asistenteId, fija: false });
    expect(verifyQrEntrada(llave, qr, ahora + FRANJA_ENTRADA_MS)).toEqual({
      valido: true,
      asistenteId,
      fija: false,
    });
    expect(validoHasta.getTime() - ahora).toBeGreaterThan(30_000);
    expect(validoHasta.getTime() - ahora).toBeLessThanOrEqual(60_000);
  });

  it('una captura de más de 60 s ya no sirve', () => {
    const { qr } = buildQrEntrada(llave, asistenteId, ahora);
    expect(verifyQrEntrada(llave, qr, ahora + 2 * FRANJA_ENTRADA_MS)).toEqual({
      valido: false,
      motivo: 'vencido',
    });
    // Tampoco uno del futuro.
    expect(verifyQrEntrada(llave, qr, ahora - FRANJA_ENTRADA_MS)).toMatchObject({ valido: false });
  });

  it('la firma de otro evento, una alterada o un texto cualquiera no pasan', () => {
    const { qr } = buildQrEntrada(llave, asistenteId, ahora);
    expect(verifyQrEntrada(randomBytes(32), qr, ahora)).toEqual({ valido: false, motivo: 'firma' });
    const [p, a, , f] = qr.split('.');
    const otraFranja = `${p}.${a}.${Math.floor(ahora / FRANJA_ENTRADA_MS) - 1}.${f}`;
    expect(verifyQrEntrada(llave, otraFranja, ahora)).toEqual({ valido: false, motivo: 'firma' });
    expect(verifyQrEntrada(llave, 'A-0231', ahora)).toEqual({ valido: false, motivo: 'formato' });
    expect(verifyQrEntrada(llave, 'PXE1.x.1.y', ahora)).toEqual({
      valido: false,
      motivo: 'formato',
    });
  });

  it('la tarjeta impresa: fija, sirve siempre y solo con la llave de su evento', () => {
    const qr = buildQrEntradaFija(llave, asistenteId);
    expect(qr).toMatch(/^PXE1\.[\w-]{22}\.[\w-]{22}$/);
    expect(verifyQrEntrada(llave, qr, ahora + 86_400_000)).toEqual({
      valido: true,
      asistenteId,
      fija: true,
    });
    expect(verifyQrEntrada(randomBytes(32), qr, ahora)).toEqual({ valido: false, motivo: 'firma' });
  });
});
