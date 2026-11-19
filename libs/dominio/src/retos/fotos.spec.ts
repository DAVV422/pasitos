import { getIntentosRestantes, getMedidasAchicadas } from './fotos';

describe('retos con foto (HU-322)', () => {
  it('achica el lado mayor a 1600 px sin agrandar nunca', () => {
    expect(getMedidasAchicadas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(getMedidasAchicadas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
    expect(getMedidasAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('los intentos que quedan', () => {
    expect(getIntentosRestantes(3, 0)).toBe(3);
    expect(getIntentosRestantes(3, 2)).toBe(1);
    expect(getIntentosRestantes(3, 5)).toBe(0);
  });
});
