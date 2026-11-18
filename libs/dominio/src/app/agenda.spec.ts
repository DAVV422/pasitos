import { describe, expect, it } from 'vitest';
import { getAhoraYSiguiente } from './agenda';

const AGENDA = [
  { id: 'cierre', inicioAt: '2026-11-21T21:00:00Z', finAt: '2026-11-21T22:00:00Z' },
  { id: 'apertura', inicioAt: '2026-11-21T13:00:00Z', finAt: '2026-11-21T14:00:00Z' },
  { id: 'taller', inicioAt: '2026-11-21T15:00:00Z', finAt: '2026-11-21T16:00:00Z' },
];

describe('ahora y a continuación (HU-308)', () => {
  it('la que está pasando y la siguiente, aunque la agenda venga desordenada', () => {
    const r = getAhoraYSiguiente(AGENDA, new Date('2026-11-21T13:30:00Z'));
    expect([r.ahora?.id, r.siguiente?.id]).toEqual(['apertura', 'taller']);
  });

  it('entre actividades solo hay siguiente; al final, nada', () => {
    const entre = getAhoraYSiguiente(AGENDA, new Date('2026-11-21T14:30:00Z'));
    expect([entre.ahora, entre.siguiente?.id]).toEqual([null, 'taller']);
    const fin = getAhoraYSiguiente(AGENDA, new Date('2026-11-22T00:00:00Z'));
    expect([fin.ahora, fin.siguiente]).toEqual([null, null]);
  });
});
