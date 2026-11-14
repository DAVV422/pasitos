import { isTipoPublicable } from './tipos';

describe('tipos de evento', () => {
  it('solo los eventos reales son publicables', () => {
    expect(isTipoPublicable('real')).toBe(true);
    expect(isTipoPublicable('demo')).toBe(false);
    expect(isTipoPublicable('prueba')).toBe(false);
  });
});
