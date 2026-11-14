import type { ErrorEvent } from '@sentry/nestjs';
import { limpiarEventoSentry, limpiarUrl } from './sentry-limpieza';

describe('limpieza de eventos de Sentry', () => {
  it('reemplaza los tokens de las rutas de acceso', () => {
    expect(limpiarUrl('https://pasitos.app/app/acceso/invitacion/q8Zr123')).toBe(
      'https://pasitos.app/app/acceso/invitacion/[token]',
    );
    expect(limpiarUrl('/v/K7Q2-M9XD')).toBe('/v/[token]');
    expect(limpiarUrl('/api/v1/auth/invitaciones/abc?x=1')).toBe(
      '/api/v1/auth/invitaciones/[token]?x=1',
    );
  });

  it('borra correos de la URL y del mensaje', () => {
    const evento = limpiarEventoSentry({
      type: undefined,
      message: 'Falló el envío a valeria@example.com',
      request: {
        url: '/buscar?q=valeria@example.com',
        headers: { cookie: 'x' },
        cookies: { a: 'b' },
      },
      user: { email: 'valeria@example.com', ip_address: '1.2.3.4' },
    } as ErrorEvent);
    expect(evento.message).toBe('Falló el envío a [correo]');
    expect(evento.request?.url).toBe('/buscar?q=[correo]');
    expect(evento.request?.headers).toBeUndefined();
    expect(evento.request?.cookies).toBeUndefined();
    expect(evento.user).toBeUndefined();
  });
});
