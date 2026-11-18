import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import type { EstadoApp } from './asistente-api.service';
import { SinAccesoPage } from './avisos.pages';
import { SesionAsistente } from './sesion-asistente';

describe('AppComponent', () => {
  const sesion = {
    estado: signal<EstadoApp | null>(null),
    sinConexion: signal(false),
    actualizadoAt: signal<number | null>(null),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([{ path: '**', component: SinAccesoPage }]),
        { provide: SesionAsistente, useValue: sesion },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el encabezado con el chip de testnet y, sin sesión, sin barra', async () => {
    sesion.estado.set(null);
    const html = await render();
    expect(html.textContent).toContain('Testnet');
    expect(html.querySelector('router-outlet')).not.toBeNull();
    expect(html.querySelector('nav[aria-label="Principal"]')).toBeNull();
  });

  it('pausado y sin conexión: las franjas y escanear apagado con su motivo', async () => {
    sesion.estado.set({
      evento: { estado: 'pausado' },
    } as unknown as EstadoApp);
    sesion.sinConexion.set(true);
    sesion.actualizadoAt.set(Date.now() - 3 * 60_000);
    const html = await render();
    expect(html.textContent).toContain('Pausamos un momento. Tus puntos están seguros.');
    expect(html.textContent).toContain('Sin conexión · actualizado hace 3 min');
    const escanear = html.querySelector('[aria-disabled="true"]');
    expect(escanear?.getAttribute('aria-label')).toBe('Escanear no disponible: Necesitas conexión');
  });
});
