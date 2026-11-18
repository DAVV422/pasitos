import { describe, expect, it } from 'vitest';
import { describeModelo, getCamposHuella, getMotivosAutomatizado } from './senales';

const SENALES = {
  plataforma: 'Android',
  modelo: 'SM-A145M',
  pantalla: '412x915@2.63',
  zonaHoraria: 'America/La_Paz',
  idioma: 'es-BO',
  nucleos: 8,
  memoria: 4,
  tactil: true,
  navegador: 'chrome',
  webdriver: false,
};

describe('señales del dispositivo (HU-307)', () => {
  it('la huella usa solo sus campos, sin el navegador', () => {
    const campos = getCamposHuella({ ...SENALES, navegador: 'samsung', memoria: 0.5 });
    expect(campos).toEqual({
      plataforma: 'Android',
      modelo: 'SM-A145M',
      pantalla: '412x915@2.63',
      zonaHoraria: 'America/La_Paz',
      idioma: 'es-BO',
      nucleos: 8,
      memoria: '0.5',
      tactil: true,
    });
    expect(getCamposHuella(undefined)).toBeNull();
    expect(getCamposHuella({})).toBeNull();
  });

  it('A8: webdriver o pantalla y núcleos imposibles', () => {
    expect(getMotivosAutomatizado(SENALES)).toEqual([]);
    expect(getMotivosAutomatizado({ ...SENALES, webdriver: true })).toEqual(['webdriver']);
    expect(getMotivosAutomatizado({ ...SENALES, pantalla: '0x0@1', nucleos: 512 })).toEqual([
      'pantalla',
      'nucleos',
    ]);
    expect(getMotivosAutomatizado(undefined)).toEqual([]);
  });

  it('el modelo legible para el equipo', () => {
    expect(describeModelo(SENALES, 'Chrome en Android')).toBe('SM-A145M · Chrome');
    expect(describeModelo({ modelo: null }, 'Safari en iPhone')).toBe('Safari en iPhone');
  });
});
