import { getEstadoQrRegistro, getFranjaRegistro, isFranjaRegistroVigente } from './qr-registro';

describe('QR de registro (HU-319)', () => {
  const base = { estado: 'activo', desde: null, hasta: null, tope: null, registros: 0 };
  const ahora = new Date('2026-11-21T14:00:00.000Z');

  it('el estado: invalidado, fuera de horario y tope lleno, en ese orden', () => {
    expect(getEstadoQrRegistro(base, ahora)).toBe('activo');
    expect(
      getEstadoQrRegistro({ ...base, estado: 'invalidado', tope: 1, registros: 1 }, ahora),
    ).toBe('invalidado');
    expect(getEstadoQrRegistro({ ...base, desde: new Date('2026-11-21T15:00:00Z') }, ahora)).toBe(
      'fuera_de_horario',
    );
    expect(getEstadoQrRegistro({ ...base, hasta: ahora }, ahora)).toBe('fuera_de_horario');
    expect(getEstadoQrRegistro({ ...base, tope: 3, registros: 3 }, ahora)).toBe('tope_lleno');
    expect(getEstadoQrRegistro({ ...base, tope: 3, registros: 2 }, ahora)).toBe('activo');
  });

  it('la franja actual sirve; la anterior, solo 5 s después de cambiar', () => {
    const inicio = 1_000 * 30_000;
    expect(getFranjaRegistro(inicio + 29_999)).toBe(1_000);
    expect(isFranjaRegistroVigente(1_000, inicio + 10_000)).toBe(true);
    expect(isFranjaRegistroVigente(999, inicio + 4_999)).toBe(true);
    expect(isFranjaRegistroVigente(999, inicio + 5_000)).toBe(false);
    expect(isFranjaRegistroVigente(998, inicio + 1_000)).toBe(false);
    // Una del futuro, nunca.
    expect(isFranjaRegistroVigente(1_001, inicio + 29_000)).toBe(false);
  });
});
