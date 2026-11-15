import type { Yo } from './auth-api.service';
import { getFuerzaPassword } from './fuerza';
import { getDestinoPendiente } from './guards';
import { toVolverSeguro } from '../acceso/comun';

function buildYo(estado: Yo['segundoFactor']['estado']): Yo {
  return {
    usuario: { id: '1', email: 'ana@example.com', nombre: 'Ana', rolPlataforma: null },
    segundoFactor: {
      requerido: true,
      configurado: true,
      metodos: ['totp'],
      estado,
      verificadoAt: null,
    },
  };
}

describe('Sesión del panel (HU-201 §7)', () => {
  it('lleva a entrar, a configurar o a verificar el segundo factor según la sesión', () => {
    expect(getDestinoPendiente(null)).toBe('/entrar');
    expect(getDestinoPendiente(buildYo('por_configurar'))).toBe('/segundo-factor/configurar');
    expect(getDestinoPendiente(buildYo('por_verificar'))).toBe('/segundo-factor');
    expect(getDestinoPendiente(buildYo('ok'))).toBeNull();
    expect(getDestinoPendiente(buildYo('no_aplica'))).toBeNull();
  });

  it('solo vuelve a rutas internas del panel', () => {
    expect(toVolverSeguro('/cuenta')).toBe('/cuenta');
    expect(toVolverSeguro('//otro-sitio.example.com')).toBe('/');
    expect(toVolverSeguro('https://otro-sitio.example.com')).toBe('/');
    expect(toVolverSeguro(undefined)).toBe('/');
  });

  it('el indicador de fuerza orienta sin bloquear', () => {
    expect(getFuerzaPassword('')).toBe('vacia');
    expect(getFuerzaPassword('abc')).toBe('corta');
    expect(getFuerzaPassword('aaaaaaaa')).toBe('debil');
    expect(getFuerzaPassword('una frase de varias palabras')).toBe('muy_buena');
  });
});
