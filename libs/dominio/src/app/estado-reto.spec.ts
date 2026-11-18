import { describe, expect, it } from 'vitest';
import { getEstadoReto, type RetoParaEstado } from './estado-reto';

const AHORA = new Date('2026-11-21T14:00:00Z');
const EN_CURSO = { estado: 'en_curso', inicioAt: new Date('2026-11-21T13:00:00Z') };
const RETO: RetoParaEstado = {
  estado: 'activo',
  topeTotal: 100,
  entregados: 10,
  vecesPorPersona: 1,
  disponibleDesde: null,
  disponibleHasta: null,
};
const NADA = { completadas: 0, ultimaAt: null };

describe('estado del reto para la persona (HU-308)', () => {
  it('disponible, completado y agotado', () => {
    expect(getEstadoReto(RETO, NADA, EN_CURSO, AHORA).estado).toBe('disponible');
    const hecho = new Date('2026-11-21T13:30:00Z');
    expect(getEstadoReto(RETO, { completadas: 1, ultimaAt: hecho }, EN_CURSO, AHORA)).toEqual({
      estado: 'completado',
      completadas: 1,
      desde: null,
      completadoAt: hecho,
    });
    expect(getEstadoReto({ ...RETO, entregados: 100 }, NADA, EN_CURSO, AHORA).estado).toBe(
      'agotado',
    );
    // Lo completado gana aunque se haya agotado o apagado después.
    expect(
      getEstadoReto(
        { ...RETO, estado: 'desactivado' },
        { completadas: 1, ultimaAt: hecho },
        EN_CURSO,
        AHORA,
      ).estado,
    ).toBe('completado');
  });

  it('desde: por la hora del reto o porque el evento no empezó', () => {
    const luego = new Date('2026-11-21T17:00:00Z');
    expect(getEstadoReto({ ...RETO, disponibleDesde: luego }, NADA, EN_CURSO, AHORA)).toMatchObject(
      {
        estado: 'desde',
        desde: luego,
      },
    );
    const publicado = { estado: 'publicado', inicioAt: new Date('2026-11-22T13:00:00Z') };
    expect(getEstadoReto(RETO, NADA, publicado, AHORA)).toMatchObject({
      estado: 'desde',
      desde: publicado.inicioAt,
    });
  });

  it('desactivado o fuera de su horario', () => {
    expect(getEstadoReto({ ...RETO, estado: 'desactivado' }, NADA, EN_CURSO, AHORA).estado).toBe(
      'desactivado',
    );
    expect(
      getEstadoReto(
        { ...RETO, disponibleHasta: new Date('2026-11-21T13:59:00Z') },
        NADA,
        EN_CURSO,
        AHORA,
      ).estado,
    ).toBe('desactivado');
  });
});
