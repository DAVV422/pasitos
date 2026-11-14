import type { IncomingMessage } from 'node:http';
import { APP_FILTER } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ProblemDetailsFilter } from '../../common/errors/problem-details.filter';
import { resolveTraceId } from '../../common/observabilidad/trace-id';
import { APP_CONFIG, loadAppConfig } from '../../config/app.config';
import { SaludController } from './salud.controller';
import { SaludService } from './salud.service';

describe('GET /api/v1/salud', () => {
  let app: NestFastifyApplication;
  const saludService = { isBaseDisponible: vi.fn<() => Promise<boolean>>() };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [SaludController],
      providers: [
        { provide: SaludService, useValue: saludService },
        {
          provide: APP_CONFIG,
          useValue: loadAppConfig({
            DATABASE_URL_APP: 'postgres://x:y@localhost/z',
            VERSION: 'abc123',
          }),
        },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        genReqId: (request: IncomingMessage) => resolveTraceId(request.headers['x-request-id']),
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 con la base disponible', async () => {
    saludService.isBaseDisponible.mockResolvedValueOnce(true);
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/salud' });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({
      estado: 'ok',
      version: 'abc123',
      base: 'ok',
      ultimoLoteConfirmadoHace: null,
    });
  });

  it('responde 503 en formato Problem Details si la base no responde', async () => {
    saludService.isBaseDisponible.mockResolvedValueOnce(false);
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/salud',
      headers: { 'x-request-id': 'prueba-trace-0001' },
    });
    expect(respuesta.statusCode).toBe(503);
    expect(respuesta.headers['content-type']).toContain('application/problem+json');
    expect(respuesta.json()).toMatchObject({
      type: 'urn:pasitos:error:servicio-no-disponible',
      status: 503,
      code: 'SERVICIO_NO_DISPONIBLE',
      traceId: 'prueba-trace-0001',
    });
  });

  it('una ruta inexistente responde 404 NO_ENCONTRADO', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/no-existe' });
    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json()).toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});

describe('traceId', () => {
  it('acepta un X-Request-Id válido y genera uno si no lo es', () => {
    expect(resolveTraceId('abcd-1234-efgh')).toBe('abcd-1234-efgh');
    expect(resolveTraceId('<script>')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveTraceId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
