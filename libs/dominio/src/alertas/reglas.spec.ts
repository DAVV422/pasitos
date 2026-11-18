import { describe, expect, it } from 'vitest';
import { isA3, isA4, isA5, isA6, isA7 } from './reglas';

const t = (s: number) => new Date(Date.UTC(2026, 10, 21, 14, 0, s));

describe('reglas de las alertas (HU-318), justo debajo y justo encima', () => {
  it('A3: más de 15 personas', () => {
    expect(isA3(15)).toBe(false);
    expect(isA3(16)).toBe(true);
  });

  it('A4: más de 3 del registrador o más de 2 del asistente', () => {
    expect(isA4({ delRegistrador: 3, delAsistente: 2 })).toBe(false);
    expect(isA4({ delRegistrador: 4, delAsistente: 0 })).toBe(true);
    expect(isA4({ delRegistrador: 0, delAsistente: 3 })).toBe(true);
  });

  it('A5: dos lugares distintos en menos de 60 s', () => {
    expect(isA5({ lugarId: 'a', at: t(0) }, { lugarId: 'b', at: t(59) })).toBe(true);
    expect(isA5({ lugarId: 'a', at: t(0) }, { lugarId: 'b', at: t(60) })).toBe(false);
    expect(isA5({ lugarId: 'a', at: t(0) }, { lugarId: 'a', at: t(5) })).toBe(false);
    expect(isA5(null, { lugarId: 'a', at: t(5) })).toBe(false);
  });

  it('A6: más de 10 vencidos en 3 cambios seguidos', () => {
    expect(isA6([11, 11, 11])).toBe(true);
    expect(isA6([11, 10, 11])).toBe(false);
    expect(isA6([11, 11])).toBe(false);
  });

  it('A7: más de 3 intentos', () => {
    expect(isA7(3)).toBe(false);
    expect(isA7(4)).toBe(true);
  });
});
