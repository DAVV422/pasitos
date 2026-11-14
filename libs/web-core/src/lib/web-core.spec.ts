import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ErrorApi } from './error-api';
import { erroresInterceptor, traceIdInterceptor } from './interceptores';

describe('interceptores comunes', () => {
  let http: HttpClient;
  let servidor: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([traceIdInterceptor, erroresInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    servidor = TestBed.inject(HttpTestingController);
  });

  afterEach(() => servidor.verify());

  it('agrega un X-Request-Id a cada request', async () => {
    const respuesta = firstValueFrom(http.get('/api/v1/salud'));
    const pedido = servidor.expectOne('/api/v1/salud');
    expect(pedido.request.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    pedido.flush({ estado: 'ok' });
    await respuesta;
  });

  it('convierte un Problem Details en ErrorApi con su código', async () => {
    const respuesta = firstValueFrom(http.get('/api/v1/salud'));
    servidor.expectOne('/api/v1/salud').flush(
      {
        code: 'SERVICIO_NO_DISPONIBLE',
        detail: 'El servicio no está disponible en este momento.',
        traceId: '01a1d7c0-8672',
      },
      { status: 503, statusText: 'Service Unavailable' },
    );
    const error = await respuesta.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      code: 'SERVICIO_NO_DISPONIBLE',
      status: 503,
      traceId: '01a1d7c0-8672',
    });
  });

  it('la falta de red es SIN_CONEXION', async () => {
    const respuesta = firstValueFrom(http.get('/api/v1/salud'));
    servidor.expectOne('/api/v1/salud').error(new ProgressEvent('error'), { status: 0 });
    const error = await respuesta.catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'SIN_CONEXION', status: 0 });
  });

  it('un código que la app no conoce es DESCONOCIDO, con el detail del servidor', async () => {
    const respuesta = firstValueFrom(http.get('/api/v1/x'));
    servidor
      .expectOne('/api/v1/x')
      .flush(
        { code: 'NUEVO_CODIGO', detail: 'Texto del servidor' },
        { status: 422, statusText: 'x' },
      );
    const error = await respuesta.catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'DESCONOCIDO', detail: 'Texto del servidor' });
  });
});
