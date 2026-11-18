import { getHuella } from './registro-tecnico';

const SENALES = {
  plataforma: 'Android',
  modelo: 'SM-A145M',
  pantalla: '412x915@2.63',
  zonaHoraria: 'America/La_Paz',
  idioma: 'es-BO',
  nucleos: 8,
  memoria: 4,
  tactil: true,
};

describe('la huella del dispositivo (HU-307 §2)', () => {
  it('es estable con las mismas señales, sin importar el orden ni el navegador', () => {
    const una = getHuella({ ...SENALES, navegador: 'chrome' });
    const otra = getHuella({
      navegador: 'samsung',
      ...Object.fromEntries(Object.entries(SENALES).reverse()),
    });
    expect(una).toHaveLength(32);
    expect(una?.equals(otra ?? Buffer.alloc(0))).toBe(true);
  });

  it('cambia si cambia la pantalla, y no hay huella sin señales', () => {
    const una = getHuella(SENALES);
    const otra = getHuella({ ...SENALES, pantalla: '412x915@3' });
    expect(una?.equals(otra ?? Buffer.alloc(0))).toBe(false);
    expect(getHuella(undefined)).toBeNull();
  });
});
