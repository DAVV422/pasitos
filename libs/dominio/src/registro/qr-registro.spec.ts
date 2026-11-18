import {
  getCiUltimos,
  getEstadoQrRegistro,
  getFranjaRegistro,
  getMetodoAutoregistro,
  isFranjaRegistroVigente,
  maskCi,
} from './qr-registro';

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

describe('carnet y método del autorregistro (HU-320)', () => {
  it('los últimos 3 dígitos, sin la extensión ni letras', () => {
    expect(getCiUltimos('4567890 LP')).toBe('890');
    expect(getCiUltimos('4567890-1B')).toBe('890');
    expect(getCiUltimos('sin numero')).toBeNull();
    expect(maskCi('890')).toBe('•••890');
    expect(maskCi(null)).toBeNull();
  });

  it('el check-in según quién muestra el QR', () => {
    expect(getMetodoAutoregistro('miembro')).toBe('autoregistro_equipo');
    expect(getMetodoAutoregistro('pantalla')).toBe('autoregistro_tablet');
    expect(getMetodoAutoregistro('impreso')).toBe('autoregistro_impreso');
  });
});
