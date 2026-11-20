import { HttpRequest } from '@angular/common/http';
import { buildPedidoFirmado } from './firma.interceptor';

const FIRMAS = { 'Idempotency-Key': 'k-1', 'X-Timestamp': '1', 'X-Firma': 'f' };

describe('pedido firmado', () => {
  it('sin cuerpo (confirmar un canje): ni cuerpo ni Content-Type, con la firma', () => {
    const pedido = buildPedidoFirmado(new HttpRequest('POST', '/api/v1/app/x', null), '', FIRMAS);
    expect(pedido.body).toBeNull();
    expect(pedido.headers.has('Content-Type')).toBe(false);
    expect(pedido.headers.get('Idempotency-Key')).toBe('k-1');
    expect(pedido.headers.get('X-Firma')).toBe('f');
  });

  it('con cuerpo: el JSON ya serializado y su Content-Type', () => {
    const pedido = buildPedidoFirmado(
      new HttpRequest('POST', '/api/v1/app/x', { nombre: 'Ana' }),
      '{"nombre":"Ana"}',
      FIRMAS,
    );
    expect(pedido.body).toBe('{"nombre":"Ana"}');
    expect(pedido.headers.get('Content-Type')).toBe('application/json');
  });
});
