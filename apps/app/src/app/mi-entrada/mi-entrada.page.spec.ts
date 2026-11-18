import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type EstadoApp, type MiEntrada } from '../asistente-api.service';
import { sortConAnulaciones } from '../historial/historial.page';
import { SesionAsistente } from '../sesion-asistente';
import { MiEntradaPage } from './mi-entrada.page';

const ENTRADA: MiEntrada = {
  qr: 'PXE1.AZ_fake.12345.firma',
  codigo: 'A-0231',
  nombre: 'Valeria Quispe',
  validoHasta: '2026-11-21T14:01:00Z',
  grupos: ['VIP'],
  ci: { cargado: true, verificado: true },
};

describe('MiEntradaPage (HU-311)', () => {
  const api = { getMiEntrada: vi.fn<() => Promise<MiEntrada>>() };
  const sesion = {
    estado: signal({
      asistente: {
        codigo: 'A-0231',
        nombre: 'Valeria Quispe',
        estado: 'registrado',
        grupos: [],
        ci: { cargado: false, verificado: false },
      },
    } as unknown as EstadoApp),
  };

  beforeEach(async () => {
    api.getMiEntrada.mockReset();
    await TestBed.configureTestingModule({
      imports: [MiEntradaPage],
      providers: [
        { provide: AsistenteApi, useValue: api },
        { provide: SesionAsistente, useValue: sesion },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(MiEntradaPage);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('el QR, el código grande, el grupo y el carnet verificado', async () => {
    api.getMiEntrada.mockResolvedValue(ENTRADA);
    const html = await render();
    expect(html.querySelector('px-qr')).not.toBeNull();
    expect(html.querySelector('[data-testid="codigo"]')?.textContent?.trim()).toBe('A-0231');
    expect(html.textContent).toContain('VIP');
    expect(html.textContent).toContain('Carnet verificado');
    expect(html.textContent).toContain('Sube el brillo');
  });

  it('sin conexión: solo el código para dictar', async () => {
    api.getMiEntrada.mockRejectedValue(new ErrorApi('SIN_CONEXION', 0, 'Sin red', null));
    const html = await render();
    expect(html.querySelector('px-qr')).toBeNull();
    expect(html.textContent).toContain('Dicta tu código: A-0231');
  });
});

describe('historial: cada anulación junto a lo que anula', () => {
  const base = { puntos: 10, hora: '', estado: 'confirmado' as const, enlaceStellar: null };
  it('la pone debajo del original y deja las demás en su orden', () => {
    const filas = sortConAnulaciones([
      { ...base, id: 'c', tipo: 'anulacion', detalle: 'Anulado: Canje', anulaMovimientoId: 'a' },
      { ...base, id: 'b', tipo: 'reto', detalle: 'Reto', anulaMovimientoId: null },
      { ...base, id: 'a', tipo: 'canje', detalle: 'Canje', anulaMovimientoId: null },
    ]);
    expect(filas.map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  it('si lo anulado está en otra página, la anulación queda donde está', () => {
    const filas = sortConAnulaciones([
      { ...base, id: 'c', tipo: 'anulacion', detalle: 'Anulado: Canje', anulaMovimientoId: 'x' },
    ]);
    expect(filas.map((f) => f.id)).toEqual(['c']);
  });
});
