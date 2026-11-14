import { formatMes, getRangoMes } from './transacciones';

describe('meses del costo de red', () => {
  it('da el rango UTC de un mes, con el fin exclusivo', () => {
    expect(getRangoMes('2026-11')).toEqual({
      desde: new Date('2026-11-01T00:00:00Z'),
      hasta: new Date('2026-12-01T00:00:00Z'),
    });
    expect(getRangoMes('2026-12').hasta).toEqual(new Date('2027-01-01T00:00:00Z'));
    expect(formatMes(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11');
  });

  it('rechaza un mes mal escrito', () => {
    expect(() => getRangoMes('2026-13')).toThrow('Mes inválido');
    expect(() => getRangoMes('noviembre')).toThrow('Mes inválido');
  });
});
