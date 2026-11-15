import { diff, getNombreRol, sanitize } from './bitacora.service';

describe('Bitácora: lo que se guarda (HU-213 §1)', () => {
  it('diff deja solo los campos que cambiaron, de los dos lados', () => {
    expect(
      diff(
        { nombre: 'Reto A', puntos: 10, tope: 100, horario: null },
        { nombre: 'Reto A', puntos: 20, tope: 100, horario: { desde: '10:00' } },
      ),
    ).toEqual({
      antes: { puntos: 10, horario: null },
      despues: { puntos: 20, horario: { desde: '10:00' } },
    });
  });

  it('quita contraseñas, tokens, PIN, secretos, llaves, IP y huellas a cualquier profundidad', () => {
    const limpio = sanitize({
      nombre: 'Tablet Sala A',
      password: 'x',
      passwordHash: 'x',
      pin: '1234',
      pin_hash: 'x',
      tokenHash: Buffer.from('x'),
      llavePublica: 'x',
      totpSecretCifrado: 'x',
      ip: '10.0.0.1',
      huella: 'x',
      datos: { token: 'x', telefono: 'sí', lista: [{ secreto: 'x', ok: 1 }] },
    });
    expect(limpio).toEqual({
      nombre: 'Tablet Sala A',
      datos: { telefono: 'sí', lista: [{ ok: 1 }] },
    });
    expect(JSON.stringify(limpio)).not.toMatch(/1234|10\.0\.0\.1/);
  });

  it('las fechas van en ISO y los bytes no se guardan', () => {
    expect(
      sanitize({ cuando: new Date('2026-11-15T15:00:00Z'), firma: Buffer.from('ab') }),
    ).toEqual({ cuando: '2026-11-15T15:00:00.000Z', firma: '[bytes]' });
  });

  it('el rol se guarda con su nombre para mostrar', () => {
    expect(getNombreRol('operador_mesa')).toBe('Operador de mesa');
    expect(getNombreRol('admin')).toBe('admin');
    expect(getNombreRol(null)).toBeNull();
  });
});
