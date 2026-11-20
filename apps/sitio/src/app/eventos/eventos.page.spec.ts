import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from '../app.routes';
import { FUENTE_EVENTOS, type MomentoEvento, type PaginaEventos } from './fuente-eventos';

const EVENTO = {
  slug: 'devfest-ejemplo',
  nombre: 'DevFest de Ejemplo',
  inicioAt: '2026-12-05T13:00:00Z',
  finAt: '2026-12-05T22:00:00Z',
  zonaHoraria: 'America/La_Paz',
  lugar: 'Centro de Ejemplo',
  organizacion: 'Comunidad de Ejemplo',
  imagen: null,
  estado: 'proximo' as const,
};

async function render(url: string, datos: Partial<Record<MomentoEvento, PaginaEventos>>) {
  const pedidos: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter(appRoutes),
      {
        provide: FUENTE_EVENTOS,
        useValue: (momento: MomentoEvento, cursor: string | null) => {
          pedidos.push(`${momento}:${cursor ?? ''}`);
          return Promise.resolve(datos[momento] ?? { items: [], pagination: { nextCursor: null } });
        },
      },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await new Promise((r) => setTimeout(r, 0));
  harness.detectChanges();
  return { pagina: harness.routeNativeElement as HTMLElement, pedidos };
}

describe('sección Eventos (HU-405)', () => {
  it('sin pestaña y sin eventos en curso, abre en Próximos', async () => {
    const { pagina, pedidos } = await render('/eventos', {
      proximos: { items: [EVENTO], pagination: { nextCursor: 'c1' } },
    });
    expect(pedidos).toEqual(['en_curso:', 'proximos:']);
    expect(pagina.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Próximos');
    const tarjeta = pagina.querySelector('[data-testid="eventos"] a');
    expect(tarjeta?.getAttribute('href')).toBe('/eventos/devfest-ejemplo');
    expect(tarjeta?.textContent).toContain('DevFest de Ejemplo');
    expect(tarjeta?.textContent).toContain('Centro de Ejemplo');
    expect(tarjeta?.textContent).toContain('Organiza Comunidad de Ejemplo');
    expect(tarjeta?.textContent).toMatch(/5 de diciembre · 9:00/);
    const enlaces = [...pagina.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(enlaces).toContain('/eventos?momento=proximos&cursor=c1');
  });

  it('con eventos en curso, abre en En curso', async () => {
    const { pagina } = await render('/eventos', {
      en_curso: { items: [{ ...EVENTO, estado: 'en_curso' }], pagination: { nextCursor: null } },
    });
    expect(pagina.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('En curso');
    expect(pagina.textContent).toContain('En curso');
  });

  it('una pestaña vacía lo dice y lleva a los pasados', async () => {
    const { pagina } = await render('/eventos?momento=proximos', {});
    expect(pagina.querySelector('[data-testid="eventos-vacio"]')?.textContent).toContain(
      'Todavía no hay eventos próximos.',
    );
  });
});
