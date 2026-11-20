import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from '../app.routes';
import { FUENTE_EVENTO, type EventoPagina } from './fuente-evento';

const EVENTO: EventoPagina = {
  slug: 'feria-ejemplo',
  nombre: 'Feria de Ejemplo',
  organizacion: 'Comunidad de Ejemplo',
  visibilidad: 'publico',
  estado: 'proximo',
  logo: null,
  portada: null,
  zonaHoraria: 'America/La_Paz',
  comoEntrar: { registroPuerta: true, qrRegistro: false },
  descripcion: 'Una feria de ciencia.',
  fecha: { inicioAt: '2026-12-05T13:00:00Z', finAt: '2026-12-05T22:00:00Z' },
  lugar: { nombre: 'Centro de Ejemplo', direccion: null, mapa: null, enlaceMapa: null },
  agenda: [
    {
      titulo: 'Charla de apertura',
      inicioAt: '2026-12-05T13:30:00Z',
      finAt: '2026-12-05T14:30:00Z',
      lugar: 'Sala A',
      expositor: null,
    },
  ],
  sponsors: [],
  preguntas: [{ pregunta: '¿Hay parqueo?', respuesta: 'Sí.' }],
  retos: [{ nombre: 'Visita el stand', descripcion: null, puntos: 20 }],
  catalogo: [{ nombre: 'Taza', imagen: null, puntos: 40, estado: 'pocos' }],
  contacto: null,
};

async function render(evento: EventoPagina | null) {
  const respuesta = { status: 200 } as ResponseInit & { status: number };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ vinculado: false }), { status: 200 }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter(appRoutes),
      { provide: FUENTE_EVENTO, useValue: () => Promise.resolve(evento) },
      { provide: RESPONSE_INIT, useValue: respuesta },
    ],
  });
  const harness = await RouterTestingHarness.create(`/eventos/${EVENTO.slug}`);
  await new Promise((r) => setTimeout(r, 0));
  harness.detectChanges();
  return { pagina: harness.routeNativeElement as HTMLElement, respuesta };
}

describe('página pública del evento (HU-406)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('muestra las secciones, Cómo entrar con la puerta y los premios sin el stock exacto', async () => {
    const { pagina, respuesta } = await render(EVENTO);
    expect(respuesta.status).toBe(200);
    expect(pagina.querySelector('h1')?.textContent).toContain('Feria de Ejemplo');
    expect(pagina.querySelector('[data-testid="fecha"]')?.textContent).toMatch(
      /Sábado 5 de diciembre · 09:00 a 18:00/,
    );
    expect(pagina.textContent).toContain('Abre el enlace de tu correo en el celular');
    expect(pagina.textContent).toContain('También puedes registrarte en la puerta');
    expect(pagina.textContent).not.toContain('QR para registrarte');
    expect(pagina.textContent).toContain('Charla de apertura');
    expect(pagina.textContent).toContain('Visita el stand');
    expect(pagina.textContent).toContain('Quedan pocos');
    expect(pagina.textContent).toContain('¿Hay parqueo?');
  });

  it('sin página pública: el aviso y un 404 de verdad', async () => {
    const { pagina, respuesta } = await render(null);
    expect(pagina.querySelector('h1')?.textContent).toContain(
      'Este evento no tiene página pública',
    );
    expect(respuesta.status).toBe(404);
  });

  it('un evento terminado no muestra Cómo entrar', async () => {
    const { pagina } = await render({ ...EVENTO, estado: 'terminado' });
    expect(pagina.textContent).toContain('Este evento ya terminó.');
    expect(pagina.textContent).not.toContain('Cómo entrar');
  });
});
