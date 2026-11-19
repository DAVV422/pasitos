import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EstadoApp, EventoApp } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';
import { InicioPage } from './inicio.page';

function estadoDe(cambios: Partial<EstadoApp['evento']> = {}, asistente = 'presente'): EstadoApp {
  return {
    asistente: {
      codigo: 'A-0231',
      nombre: 'Valeria Quispe',
      estado: asistente,
      grupos: [],
      ci: { cargado: false, verificado: false },
    },
    saldo: 80,
    evento: {
      id: 'e1',
      nombre: 'Foro de prueba',
      estado: 'en_curso',
      inicioAt: '2026-11-21T13:00:00Z',
      finAt: '2026-11-21T22:00:00Z',
      nombrePuntos: 'puntos',
      requiereCheckIn: true,
      zonaHoraria: 'America/La_Paz',
      ...cambios,
    },
    retos: [
      { id: 'r1', estado: 'disponible', completadas: 0, desde: null, completadoAt: null },
      {
        id: 'r2',
        estado: 'completado',
        completadas: 1,
        desde: null,
        completadoAt: '2026-11-21T14:05:00Z',
      },
    ],
    premios: [],
    ultimosMovimientos: [],
  };
}

const EVENTO: EventoApp = {
  id: 'e1',
  nombre: 'Foro de prueba',
  logoUrl: null,
  info: {
    descripcion: null,
    contacto: null,
    wifi: null,
    inicioAt: '2026-11-21T13:00:00.000Z',
    finAt: '2026-11-21T22:00:00.000Z',
    lugarNombre: null,
    lugarDireccion: null,
    portadaUrl: null,
    planoUrl: null,
    nombrePuntos: 'puntos',
  },
  lugares: [],
  sponsors: [],
  preguntas: [],
  retos: [
    {
      id: 'r1',
      nombre: 'Charla de apertura',
      descripcion: null,
      puntos: 20,
      tipo: 'qr',
      lugar: 'Sala A',
      lugarId: null,
      sponsorId: null,
      grupo: null,
      instruccionFoto: null,
      permiteGaleria: true,
      autorizacionUso: 'opcional',
      intentosMax: 3,
      disponibleDesde: null,
      disponibleHasta: null,
    },
    {
      id: 'r2',
      nombre: 'Bienvenida al stand',
      descripcion: null,
      puntos: 10,
      tipo: 'qr',
      lugar: null,
      lugarId: null,
      sponsorId: null,
      grupo: null,
      instruccionFoto: null,
      permiteGaleria: true,
      autorizacionUso: 'opcional',
      intentosMax: 3,
      disponibleDesde: null,
      disponibleHasta: null,
    },
  ],
  premios: [],
  agenda: [],
};

/** *Inicio* en sus estados (HU-308 §4). El anulado y el sin conexión los decide el shell. */
describe('InicioPage', () => {
  const sesion = {
    estado: signal<EstadoApp | null>(null),
    evento: signal<EventoApp | null>(EVENTO),
    sinConexion: signal(false),
    aviso: signal<string | null>(null),
    bienvenida: signal<string | null>(null),
    avisoFoto: signal(null),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideRouter([]), { provide: SesionAsistente, useValue: sesion }],
    }).compileComponents();
  });

  async function render(estado: EstadoApp | null): Promise<HTMLElement> {
    sesion.estado.set(estado);
    const fixture = TestBed.createComponent(InicioPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('cargando', async () => {
    expect((await render(null)).textContent).toContain('Cargando');
  });

  it('en curso: el saldo, el progreso y los retos para hacer', async () => {
    const html = await render(estadoDe());
    expect(html.querySelector('[data-testid="saldo"]')?.textContent?.trim()).toBe('80');
    expect(html.textContent).toContain('1 de 2 retos');
    expect(html.textContent).toContain('Charla de apertura');
    expect(html.textContent).toContain('Escanea el QR en Sala A');
    expect(html.textContent).not.toContain('Pasa por la puerta');
  });

  it('antes del check-in: el aviso y Mi entrada', async () => {
    const html = await render(estadoDe({}, 'registrado'));
    expect(html.textContent).toContain('Pasa por la puerta para empezar a ganar puntos');
    expect(html.querySelector('a[href="/mi-entrada"]')).not.toBeNull();
  });

  it('no iniciado (A19): cuándo empieza y cuánto falta', async () => {
    const html = await render(estadoDe({ estado: 'publicado', inicioAt: '2099-11-21T13:00:00Z' }));
    expect(html.textContent).toContain('¡Hola, Valeria!');
    expect(html.textContent).toContain('empieza el');
    expect(html.textContent).toContain('a las 09:00');
    expect(html.textContent).toContain('Faltan');
  });

  it('cerrado (A18): gracias, los completados y el historial', async () => {
    const html = await render(estadoDe({ estado: 'cerrado' }));
    expect(html.textContent).toContain('terminó. ¡Gracias por quedarte!');
    expect(html.textContent).toContain('Tus retos completados');
    expect(html.textContent).toContain('Bienvenida al stand');
    expect(html.textContent).not.toContain('Charla de apertura');
    expect(html.querySelector('a[href="/historial"]')).not.toBeNull();
  });
});
