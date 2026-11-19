import { normalizeCi } from './carnet';

describe('normalizar el carnet (HU-321)', () => {
  it.each([
    ['4567890 LP', '4567890'],
    ['4567890-1B', '4567890-1B'],
    [' 4567890 - 1b  CB ', '4567890-1B'],
    ['4567890', '4567890'],
    ['4567890  lp', '4567890'],
    ['E-123456', 'E-123456'],
  ])('%s → %s', (ci, esperado) => {
    expect(normalizeCi(ci)).toBe(esperado);
  });
});
