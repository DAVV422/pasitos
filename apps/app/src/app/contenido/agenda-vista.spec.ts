import type { ActividadApp } from '../asistente-api.service';
import { getLugaresAgenda, groupAgenda } from './agenda-vista';

function actividad(id: string, inicio: string, fin: string, extra: Partial<ActividadApp> = {}) {
  return {
    id,
    titulo: `Charla ${id}`,
    inicioAt: inicio,
    finAt: fin,
    lugar: null,
    expositor: null,
    retoId: null,
    ...extra,
  } satisfies ActividadApp;
}

describe('agenda-vista', () => {
  const agenda = [
    actividad('b', '2026-11-21T15:00:00.000Z', '2026-11-21T16:00:00.000Z', {
      lugar: 'Sala B',
      retoId: 'r1',
    }),
    actividad('a', '2026-11-21T13:00:00.000Z', '2026-11-21T14:00:00.000Z', { lugar: 'Sala A' }),
    // A las 01:00 UTC del 22 todavía es el 21 en La Paz (UTC−4).
    actividad('c', '2026-11-22T01:00:00.000Z', '2026-11-22T02:00:00.000Z', { retoId: 'otro' }),
    actividad('d', '2026-11-22T14:00:00.000Z', '2026-11-22T15:00:00.000Z', { lugar: 'Sala A' }),
  ];
  const opciones = {
    zona: 'America/La_Paz',
    ahora: Date.parse('2026-11-21T15:30:00.000Z'),
    puntosPorReto: new Map([['r1', 20]]),
  };

  it('agrupa por día en la zona del evento, en orden, y marca lo de ahora', () => {
    const dias = groupAgenda(agenda, opciones);
    expect(dias.map((d) => [d.clave, d.actividades.map((a) => a.id)])).toEqual([
      ['2026-11-21', ['a', 'b', 'c']],
      ['2026-11-22', ['d']],
    ]);
    const [primero] = dias;
    expect(primero?.actividades.map((a) => [a.ahora, a.terminada])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it('solo muestra los puntos de los retos que la persona ve', () => {
    const [primero] = groupAgenda(agenda, opciones);
    expect(primero?.actividades.map((a) => a.puntos)).toEqual([null, 20, null]);
  });

  it('filtra por lugar y lista los lugares sin repetir', () => {
    const dias = groupAgenda(agenda, { ...opciones, lugar: 'Sala A' });
    expect(dias.flatMap((d) => d.actividades.map((a) => a.id))).toEqual(['a', 'd']);
    expect(getLugaresAgenda(agenda)).toEqual(['Sala A', 'Sala B']);
  });
});
