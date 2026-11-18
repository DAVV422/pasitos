import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type EstadoApp } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';
import { isQrReto, ReclamoService } from './reclamo.service';

describe('reclamar un QR (HU-310)', () => {
  const api = { claim: vi.fn() };
  const sesion = {
    estado: signal({ saldo: 0, evento: { zonaHoraria: 'America/La_Paz' } } as unknown as EstadoApp),
    set: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    api.claim.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AsistenteApi, useValue: api },
        { provide: SesionAsistente, useValue: sesion },
      ],
    });
  });

  it('reconoce el QR de reto y el enlace de la cámara del sistema', () => {
    expect(isQrReto('PX1.abc.def')).toBe(true);
    expect(isQrReto('https://pasitos.example.com/r/PX1.abc.def')).toBe(true);
    expect(isQrReto('https://otra.example.com')).toBe(false);
  });

  it('ganar: el saldo que confirma el servidor', async () => {
    api.claim.mockResolvedValue({
      movimientoId: 'm',
      reto: { id: 'r', nombre: 'Charla' },
      puntos: 20,
      saldo: 80,
    });
    const servicio = TestBed.inject(ReclamoService);
    await servicio.claim('PX1.a.b');
    expect(servicio.resultado()).toMatchObject({ tipo: 'ganado', reclamo: { saldo: 80 } });
    expect(sesion.set).toHaveBeenCalledWith(expect.objectContaining({ saldo: 80 }));
  });

  it('los mensajes de Flujos §5.3, con la hora del evento', async () => {
    api.claim.mockRejectedValue(
      new ErrorApi('RETO_YA_COMPLETADO', 409, '', null, [], {
        completadoAt: '2026-11-21T14:31:00Z',
      }),
    );
    const servicio = TestBed.inject(ReclamoService);
    await servicio.claim('PX1.a.c');
    expect(servicio.resultado()).toMatchObject({
      mensaje: 'Ya completaste este reto a las 10:31.',
    });
    api.claim.mockRejectedValue(new ErrorApi('SIN_CHECK_IN', 422, '', null));
    await servicio.claim('PX1.a.d');
    expect(servicio.resultado()).toMatchObject({
      mensaje: 'Primero registra tu llegada en la entrada.',
      accion: 'mi_entrada',
    });
  });

  it('no manda el mismo QR dos veces en 3 s', async () => {
    api.claim.mockResolvedValue({
      movimientoId: 'm',
      reto: { id: 'r', nombre: 'C' },
      puntos: 1,
      saldo: 1,
    });
    const servicio = TestBed.inject(ReclamoService);
    await servicio.claim('PX1.a.e');
    await servicio.claim('PX1.a.e');
    expect(api.claim).toHaveBeenCalledTimes(1);
  });
});
