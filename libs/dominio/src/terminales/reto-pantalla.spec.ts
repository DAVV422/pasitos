import { describe, expect, it } from 'vitest';
import { pickRetoDePantalla, type RetoDeSala } from './reto-pantalla';

const AHORA = new Date('2026-11-21T15:00:00Z');
const h = (hora: string) => new Date(`2026-11-21T${hora}:00Z`);
const SALA_A = 'sala-a';

function reto(id: string, cambios: Partial<RetoDeSala> = {}): RetoDeSala {
  return {
    id,
    lugarId: SALA_A,
    tipo: 'qr',
    estado: 'activo',
    modoQr: 'por_tiempo',
    disponibleDesde: null,
    disponibleHasta: null,
    entregados: 0,
    topeTotal: 100,
    ...cambios,
  };
}

const PANTALLA = { estado: 'activa', lugarId: SALA_A, retoFijadoId: null };
const EN_CURSO = { estado: 'en_curso' };

describe('qué reto muestra la pantalla (HU-314 §2)', () => {
  it('el del lugar en horario; con varios, el de inicio más reciente', () => {
    const r = pickRetoDePantalla(
      PANTALLA,
      [
        reto('manana', { disponibleDesde: h('13:00'), disponibleHasta: h('16:00') }),
        reto('ahora', { disponibleDesde: h('14:30'), disponibleHasta: h('16:00') }),
        reto('otro-lugar', { lugarId: 'sala-b' }),
      ],
      EN_CURSO,
      AHORA,
    );
    expect([r.estado, r.reto?.id]).toEqual(['activa', 'ahora']);
  });

  it('el fijado por el operador gana, si sigue disponible', () => {
    const retos = [reto('del-lugar'), reto('fijado', { lugarId: 'sala-b' })];
    const fijado = { ...PANTALLA, retoFijadoId: 'fijado' };
    expect(pickRetoDePantalla(fijado, retos, EN_CURSO, AHORA).reto?.id).toBe('fijado');
    const apagado = [reto('del-lugar'), reto('fijado', { estado: 'desactivado' })];
    expect(pickRetoDePantalla(fijado, apagado, EN_CURSO, AHORA).reto?.id).toBe('del-lugar');
  });

  it('fuera de horario, en espera con el próximo', () => {
    const r = pickRetoDePantalla(
      PANTALLA,
      [
        reto('termino', { disponibleDesde: h('10:00'), disponibleHasta: h('11:00') }),
        reto('tarde', { disponibleDesde: h('17:00') }),
        reto('cierre', { disponibleDesde: h('19:00') }),
      ],
      EN_CURSO,
      AHORA,
    );
    expect([r.estado, r.reto, r.proximo?.id]).toEqual(['espera', null, 'tarde']);
  });

  it('pausada, agotado, evento no activo y los modos que no son del piloto', () => {
    expect(
      pickRetoDePantalla({ ...PANTALLA, estado: 'pausada' }, [reto('a')], EN_CURSO, AHORA).estado,
    ).toBe('pausada');
    expect(
      pickRetoDePantalla(PANTALLA, [reto('a', { entregados: 100 })], EN_CURSO, AHORA).estado,
    ).toBe('agotado');
    expect(pickRetoDePantalla(PANTALLA, [reto('a')], { estado: 'pausado' }, AHORA).estado).toBe(
      'evento_no_activo',
    );
    expect(
      pickRetoDePantalla(PANTALLA, [reto('a', { modoQr: 'bajo_demanda' })], EN_CURSO, AHORA).estado,
    ).toBe('espera');
    expect(
      pickRetoDePantalla(PANTALLA, [reto('a', { tipo: 'otorgado' })], EN_CURSO, AHORA).estado,
    ).toBe('espera');
  });
});
