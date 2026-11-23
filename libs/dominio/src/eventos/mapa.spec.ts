import { describe, expect, it } from 'vitest';
import { DISTANCIA_ENCIMADOS, findLugaresCercanos, getDistanciaPlano } from './mapa';

const lugar = (id: string, mapaX: number | null, mapaY: number | null) => ({ id, mapaX, mapaY });

describe('mapa del evento', () => {
  it('mide en anchos del plano, con la proporción de la imagen', () => {
    const a = { mapaX: 0, mapaY: 0 };
    expect(getDistanciaPlano(a, { mapaX: 0.3, mapaY: 0 }, 1)).toBeCloseTo(0.3);
    // Un plano el doble de alto que de ancho: bajar 0,1 del alto son 0,2 anchos.
    expect(getDistanciaPlano(a, { mapaX: 0, mapaY: 0.1 }, 2)).toBeCloseTo(0.2);
  });

  it('junta a los vecinos de cada lugar, del más cercano al más lejano', () => {
    const cercanos = findLugaresCercanos(
      [
        lugar('a', 0.5, 0.5),
        lugar('b', 0.52, 0.5),
        lugar('c', 0.51, 0.5),
        lugar('d', 0.9, 0.9),
        lugar('sin-marca', null, null),
      ],
      0.05,
      1,
    );
    expect(cercanos.get('a')?.map((l) => l.id)).toEqual(['c', 'b']);
    expect(cercanos.get('b')?.map((l) => l.id)).toEqual(['c', 'a']);
    expect(cercanos.has('d')).toBe(false);
    expect(cercanos.has('sin-marca')).toBe(false);
  });

  it('dos números encimados aun con el zoom más grande', () => {
    expect(DISTANCIA_ENCIMADOS).toBeGreaterThan(0.02);
    expect(DISTANCIA_ENCIMADOS).toBeLessThan(0.03);
  });
});
