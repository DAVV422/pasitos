import { getDiasBorradoFoto, getIntentosRestantes, getMedidasAchicadas } from './fotos';

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

  it('el plazo de borrado: 7 las inapropiadas, 90 las autorizadas y 30 las demás', () => {
    const base = { motivoRechazo: null, autorizaUso: true, autorizaUsoRetiradaAt: null };
    expect(getDiasBorradoFoto(base)).toBe(90);
    expect(getDiasBorradoFoto({ ...base, autorizaUsoRetiradaAt: new Date() })).toBe(30);
    expect(getDiasBorradoFoto({ ...base, autorizaUso: false })).toBe(30);
    expect(getDiasBorradoFoto({ ...base, motivoRechazo: 'inapropiada' })).toBe(7);
  });
});
