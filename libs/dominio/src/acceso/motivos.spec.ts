import { describe, expect, it } from 'vitest';
import { describeMotivoAnulacion, isAnuladaPorVinculacion, toMotivoAnulacion } from './motivos';

describe('motivos de revincular (HU-304)', () => {
  it('se guardan como el tipo, o otro con su texto', () => {
    expect(toMotivoAnulacion({ tipo: 'cambio_celular' })).toBe('cambio_celular');
    expect(toMotivoAnulacion({ tipo: 'otro', texto: 'Se le rompió' })).toBe('otro: Se le rompió');
    expect(toMotivoAnulacion(null)).toBe('nueva_vinculacion');
  });

  it('el celular anulado por otra vinculación todavía puede decir No fui yo', () => {
    for (const motivo of ['nueva_vinculacion', 'cambio_celular', 'otro: algo']) {
      expect(isAnuladaPorVinculacion(motivo)).toBe(true);
    }
    expect(isAnuladaPorVinculacion('anulado_por_equipo')).toBe(false);
    expect(isAnuladaPorVinculacion(null)).toBe(false);
  });

  it('se describen para la puerta', () => {
    expect(describeMotivoAnulacion('borro_datos')).toBe('Borró los datos del navegador');
    expect(describeMotivoAnulacion('otro: Se le rompió')).toBe('Se le rompió');
  });
});
