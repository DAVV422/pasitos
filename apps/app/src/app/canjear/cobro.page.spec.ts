import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AsistenteApi, type EstadoApp, type VistaCobro } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';
import { CobroPage } from './cobro.page';

const VISTA: VistaCobro = {
  id: 'c1',
  mesa: 'Mesa 1',
  items: [{ premioId: 'p1', nombre: 'Taza', cantidad: 1, puntos: 50 }],
  total: 50,
  saldo: 80,
  saldoDespues: 30,
  expiraAt: new Date(Date.now() + 120_000).toISOString(),
  estado: 'pendiente',
  requiereCi: false,
};

describe('CobroPage (HU-313)', () => {
  const api = { getCobro: vi.fn(), confirmCobro: vi.fn() };
  const sesion = {
    estado: signal({ saldo: 80, evento: { nombrePuntos: 'puntos' } } as unknown as EstadoApp),
    set: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
  };

  beforeEach(async () => {
    api.getCobro.mockReset();
    api.confirmCobro.mockReset();
    await TestBed.configureTestingModule({
      imports: [CobroPage],
      providers: [
        provideRouter([]),
        { provide: AsistenteApi, useValue: api },
        { provide: SesionAsistente, useValue: sesion },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(CobroPage);
    fixture.componentRef.setInput('token', 'tok');
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    return fixture;
  }

  it('la mesa cobra: el total, lo que queda y Confirmar; al confirmar, el comprobante grande', async () => {
    api.getCobro.mockResolvedValue(VISTA);
    api.confirmCobro.mockResolvedValue({
      comprobante: 'C-4821',
      items: VISTA.items,
      total: 50,
      saldo: 30,
    });
    const fixture = await render();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Mesa 1 te cobra');
    expect(html.textContent).toContain('Te quedan 30');
    const boton = [...html.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirmar canje'),
    );
    boton?.click();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(html.querySelector('[data-testid="comprobante"]')?.textContent?.trim()).toBe('C-4821');
    expect(html.textContent).toContain('Muéstralo en la mesa');
  });

  it('sin saldo suficiente, el botón está deshabilitado y dice cuánto falta', async () => {
    api.getCobro.mockResolvedValue({ ...VISTA, total: 110, saldoDespues: -30 });
    const html = (await render()).nativeElement as HTMLElement;
    expect(html.textContent).toContain('Te faltan 30 puntos');
    const boton = [...html.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirmar canje'),
    );
    expect(boton?.disabled || boton?.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});
