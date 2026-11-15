import {
  buildNombreReemplazo,
  esquemaGenerarConexion,
  esquemaPantalla,
  getEstadoConexion,
} from './esquemas';

describe('Terminales (HU-209)', () => {
  it('en línea si avisó hace menos de 90 s; desconectada manda', () => {
    const ahora = new Date('2026-12-01T13:00:00Z');
    expect(getEstadoConexion('activa', new Date('2026-12-01T12:59:00Z'), ahora)).toBe('en_linea');
    expect(getEstadoConexion('activa', new Date('2026-12-01T12:58:00Z'), ahora)).toBe(
      'sin_conexion',
    );
    expect(getEstadoConexion('activa', null, ahora)).toBe('sin_conexion');
    expect(getEstadoConexion('desconectada', ahora, ahora)).toBe('desconectada');
  });

  it('el nombre de la pantalla que reemplaza suma su número', () => {
    expect(buildNombreReemplazo('Tablet Sala A')).toBe('Tablet Sala A (2)');
    expect(buildNombreReemplazo('Tablet Sala A (2)')).toBe('Tablet Sala A (3)');
  });

  it('el PIN son 4 números y el motivo, de 5 a 300 caracteres', () => {
    const lugarId = '01900000-0000-7000-8000-000000000000';
    expect(esquemaPantalla.safeParse({ nombre: 'Tablet', lugarId, pin: '0421' }).success).toBe(
      true,
    );
    expect(esquemaPantalla.safeParse({ nombre: 'Tablet', lugarId, pin: '42a1' }).success).toBe(
      false,
    );
    expect(esquemaGenerarConexion.safeParse({ motivo: 'roto' }).success).toBe(false);
    expect(esquemaGenerarConexion.safeParse({}).success).toBe(true);
  });
});
