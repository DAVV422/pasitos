import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EstadoApp, EventoApp } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';
import { RetoDetallePage } from './reto-detalle.page';

const ESTADO: EstadoApp = {
  asistente: {
    codigo: 'A-0231',
    nombre: 'Valeria Quispe',
    estado: 'presente',
    grupos: [],
    ci: { cargado: false, verificado: false },
    celularCargado: false,
  },
  saldo: 80,
  vencidos: 0,
  evento: {
    id: 'e1',
    nombre: 'Foro de prueba',
    estado: 'en_curso',
    inicioAt: '2026-11-21T13:00:00Z',
    finAt: '2026-11-21T22:00:00Z',
    nombrePuntos: 'puntos',
    requiereCheckIn: true,
    pedirCelular: 'opcional',
    zonaHoraria: 'America/La_Paz',
    cierreProgramadoAt: null,
  },
  retos: [{ id: 'r1', estado: 'disponible', completadas: 0, desde: null, completadoAt: null }],
  premios: [],
  ultimosMovimientos: [],
};

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
      nombre: 'Síguenos en redes',
      descripcion: 'Sube una historia en https://instagram.com/pasitos y etiquétanos.',
      enlaces: [
        { url: 'https://www.instagram.com/pasitos', etiqueta: null },
        { url: 'https://www.tiktok.com/@pasitos', etiqueta: 'Ver video en TikTok' },
        { url: 'https://x.com/pasitos', etiqueta: null },
        { url: 'https://www.facebook.com/pasitos', etiqueta: null },
      ],
      puntos: 15,
      tipo: 'otorgado',
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

describe('RetoDetallePage', () => {
  const sesion = {
    estado: signal<EstadoApp | null>(ESTADO),
    evento: signal<EventoApp | null>(EVENTO),
    errorEvento: signal(false),
    sinConexion: signal(false),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetoDetallePage],
      providers: [provideRouter([]), { provide: SesionAsistente, useValue: sesion }],
    }).compileComponents();
  });

  it('convierte enlaces https:// en la descripción y muestra los botones de redes sociales con target="_blank"', async () => {
    const fixture = TestBed.createComponent(RetoDetallePage);
    fixture.componentRef.setInput('id', 'r1');
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;

    const enlaceDesc = html.querySelector<HTMLAnchorElement>('[data-testid="descripcion-reto"] a');
    expect(enlaceDesc).not.toBeNull();
    expect(enlaceDesc?.getAttribute('href')).toBe('https://instagram.com/pasitos');
    expect(enlaceDesc?.getAttribute('target')).toBe('_blank');
    expect(enlaceDesc?.getAttribute('rel')).toBe('noopener noreferrer');

    const botones = html.querySelectorAll<HTMLAnchorElement>('[data-testid="enlaces-reto"] a');
    expect(botones.length).toBe(4);
    expect(botones[0]?.getAttribute('href')).toBe('https://www.instagram.com/pasitos');
    expect(botones[0]?.getAttribute('target')).toBe('_blank');
    expect(botones[0]?.textContent?.trim()).toBe('Instagram');
    expect(botones[1]?.textContent?.trim()).toBe('Ver video en TikTok');
    expect(botones[2]?.textContent?.trim()).toBe('X');
    expect(botones[3]?.textContent?.trim()).toBe('Facebook');
  });
});
