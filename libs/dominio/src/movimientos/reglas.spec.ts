import { validateMovimiento, type ContextoMovimiento, type ContextoReto } from './reglas';
import { isSignoValido } from './tipos';

const reto: ContextoReto = {
  activo: true,
  topeTotal: 10,
  entregados: 0,
  vecesPorPersona: 1,
  completadas: 0,
};
const base: ContextoMovimiento = { saldo: 0, ganadosPersona: 0, topePuntosPersona: null, reto };

describe('validateMovimiento', () => {
  it('acepta un reto con tope y veces disponibles', () => {
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, base)).toBeNull();
  });

  it('rechaza un reto desactivado', () => {
    const contexto = { ...base, reto: { ...reto, activo: false } };
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, contexto)).toBe('RETO_NO_DISPONIBLE');
  });

  it('acepta el último lugar del tope y rechaza el siguiente', () => {
    const justo = { ...base, reto: { ...reto, entregados: 9 } };
    const lleno = { ...base, reto: { ...reto, entregados: 10 } };
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, justo)).toBeNull();
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, lleno)).toBe('TOPE_ALCANZADO');
  });

  it('respeta las veces por persona', () => {
    const segunda = { ...base, reto: { ...reto, vecesPorPersona: 2, completadas: 1 } };
    const tercera = { ...base, reto: { ...reto, vecesPorPersona: 2, completadas: 2 } };
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, segunda)).toBeNull();
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, tercera)).toBe('RETO_YA_COMPLETADO');
  });

  it('un reto ya completado se informa antes que el tope', () => {
    const contexto = { ...base, reto: { ...reto, entregados: 10, completadas: 1 } };
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, contexto)).toBe('RETO_YA_COMPLETADO');
  });

  it('exige el contexto del reto', () => {
    const sinReto: ContextoMovimiento = { saldo: 0, ganadosPersona: 0, topePuntosPersona: null };
    expect(() => validateMovimiento({ tipo: 'reto', puntos: 20 }, sinReto)).toThrow();
  });

  it('aplica el tope de puntos por persona a retos y check-in', () => {
    const contexto = { ...base, ganadosPersona: 80, topePuntosPersona: 100 };
    expect(validateMovimiento({ tipo: 'reto', puntos: 20 }, contexto)).toBeNull();
    expect(validateMovimiento({ tipo: 'reto', puntos: 21 }, contexto)).toBe('TOPE_PUNTOS_PERSONA');
    expect(validateMovimiento({ tipo: 'checkin', puntos: 21 }, contexto)).toBe(
      'TOPE_PUNTOS_PERSONA',
    );
  });

  it('el tope por persona no aplica a ajustes ni anulaciones', () => {
    const contexto = { ...base, ganadosPersona: 100, topePuntosPersona: 100 };
    expect(validateMovimiento({ tipo: 'ajuste', puntos: 10 }, contexto)).toBeNull();
    expect(validateMovimiento({ tipo: 'anulacion', puntos: 10 }, contexto)).toBeNull();
  });

  it('nunca deja el saldo negativo', () => {
    const contexto = { ...base, saldo: 30 };
    expect(validateMovimiento({ tipo: 'canje', puntos: -30 }, contexto)).toBeNull();
    expect(validateMovimiento({ tipo: 'canje', puntos: -31 }, contexto)).toBe('SALDO_INSUFICIENTE');
    expect(validateMovimiento({ tipo: 'ajuste', puntos: -31 }, contexto)).toBe(
      'SALDO_INSUFICIENTE',
    );
  });
});

describe('isSignoValido', () => {
  it.each([
    ['checkin', 0, true],
    ['checkin', 5, true],
    ['checkin', -1, false],
    ['reto', 0, false],
    ['reto', 20, true],
    ['canje', -10, true],
    ['canje', 10, false],
    ['vencimiento', -1, true],
    ['vencimiento', 0, false],
    ['ajuste', -5, true],
    ['ajuste', 0, false],
    ['anulacion', 5, true],
    ['reto', 1.5, false],
  ] as const)('%s con %d puntos → %s', (tipo, puntos, esperado) => {
    expect(isSignoValido(tipo, puntos)).toBe(esperado);
  });
});
