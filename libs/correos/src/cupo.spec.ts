import {
  addDias,
  CUPO_POR_DEFECTO,
  getCupoHoy,
  getDiaDeSalida,
  getInicioDia,
  getProgramadoPara,
} from './cupo';

describe('Cupo diario de correos (D57)', () => {
  it('el día empieza a las 00:00 de Bolivia (04:00 UTC)', () => {
    expect(getInicioDia(new Date('2026-11-15T03:59:00Z')).toISOString()).toBe(
      '2026-11-14T04:00:00.000Z',
    );
    expect(getInicioDia(new Date('2026-11-15T04:00:00Z')).toISOString()).toBe(
      '2026-11-15T04:00:00.000Z',
    );
    expect(getInicioDia(new Date('2026-11-15T23:30:00Z')).toISOString()).toBe(
      '2026-11-15T04:00:00.000Z',
    );
  });

  it('sin envíos: 80 para seguridad y 70 para los demás', () => {
    expect(getCupoHoy(CUPO_POR_DEFECTO, { total: 0, seguridad: 0 })).toEqual({
      seguridad: 80,
      resto: 70,
    });
  });

  it('con 70 de los demás ya enviados, solo queda la reserva de seguridad', () => {
    expect(getCupoHoy(CUPO_POR_DEFECTO, { total: 70, seguridad: 0 })).toEqual({
      seguridad: 10,
      resto: 0,
    });
  });

  it('los de seguridad también gastan el tope total', () => {
    expect(getCupoHoy(CUPO_POR_DEFECTO, { total: 75, seguridad: 20 })).toEqual({
      seguridad: 5,
      resto: 5,
    });
    expect(getCupoHoy(CUPO_POR_DEFECTO, { total: 80, seguridad: 80 })).toEqual({
      seguridad: 0,
      resto: 0,
    });
  });

  it('100 invitaciones: 70 hoy, 30 mañana', () => {
    const cupo = getCupoHoy(CUPO_POR_DEFECTO, { total: 0, seguridad: 0 });
    expect(getDiaDeSalida(0, false, cupo, CUPO_POR_DEFECTO)).toBe(0);
    expect(getDiaDeSalida(69, false, cupo, CUPO_POR_DEFECTO)).toBe(0);
    expect(getDiaDeSalida(70, false, cupo, CUPO_POR_DEFECTO)).toBe(1);
    expect(getDiaDeSalida(99, false, cupo, CUPO_POR_DEFECTO)).toBe(1);
    expect(getDiaDeSalida(140, false, cupo, CUPO_POR_DEFECTO)).toBe(2);
  });

  it('un correo de seguridad sale hoy aunque los demás ya no tengan cupo', () => {
    const cupo = getCupoHoy(CUPO_POR_DEFECTO, { total: 70, seguridad: 0 });
    expect(getDiaDeSalida(0, true, cupo, CUPO_POR_DEFECTO)).toBe(0);
    expect(getDiaDeSalida(0, false, cupo, CUPO_POR_DEFECTO)).toBe(1);
  });

  it('programado para: ahora si sale hoy; si no, las 00:00 de ese día', () => {
    const ahora = new Date('2026-11-15T15:00:00Z');
    expect(getProgramadoPara(0, ahora)).toBe(ahora);
    expect(getProgramadoPara(2, ahora).toISOString()).toBe(
      addDias(new Date('2026-11-15T04:00:00Z'), 2).toISOString(),
    );
  });
});
