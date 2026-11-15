import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RolEvento } from '@pasitos/dominio';
import { ContextoEventoService } from '@pasitos/panel';
import { EventoActualService, EventoLayout } from './evento.layout';
import type { EventoDetalle } from './eventos-api.service';

function buildEvento(miRol: RolEvento): EventoDetalle {
  return {
    id: 'evento-1',
    organizacionId: 'org-1',
    slug: 'meetup',
    nombre: 'Meetup',
    tipo: 'real',
    estado: 'borrador',
    visibilidad: 'privado',
    zonaHoraria: 'America/La_Paz',
    inicioAt: '2026-12-05T14:00:00Z',
    finAt: '2026-12-05T22:00:00Z',
    publicadoAt: null,
    iniciadoAt: null,
    nombrePuntos: 'puntos',
    reglas: {
      registroPuertaActivo: true,
      topeRegistrosPuerta: null,
      puntosCheckIn: 0,
      retosRequierenCheckIn: true,
      topePuntosPersona: null,
      topeAjuste: 100,
    },
    descripcion: null,
    contacto: null,
    wifi: null,
    seccionesPublicas: [],
    imagenes: { logoArchivoId: null, portadaArchivoId: null, planoArchivoId: null },
    ubicacion: { nombre: null, direccion: null, lat: null, lng: null, mapaEstaticoArchivoId: null },
    miRol,
    stellar: { contratoId: null, enlace: null },
    contadores: { retos: 0, pantallas: 0, pantallasConectadas: 0, mesas: 0, invitados: 0 },
  };
}

describe('Menú del evento según el rol (HU-204 §5)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it.each([
    [
      'dueno',
      [
        '← Mis eventos',
        'Resumen',
        'Configuración',
        'Retos',
        'Catálogo',
        'Pantallas',
        'Mesas',
        'Lugares',
        'Agenda',
        'Sponsors',
        'Preguntas',
        'Equipo',
        'Bitácora',
      ],
    ],
    [
      'coorganizador',
      [
        '← Mis eventos',
        'Resumen',
        'Configuración',
        'Retos',
        'Catálogo',
        'Pantallas',
        'Mesas',
        'Lugares',
        'Agenda',
        'Sponsors',
        'Preguntas',
        'Equipo',
        'Bitácora',
      ],
    ],
    [
      'registrador',
      [
        '← Mis eventos',
        'Resumen',
        'Retos',
        'Catálogo',
        'Lugares',
        'Agenda',
        'Sponsors',
        'Preguntas',
      ],
    ],
    [
      'financiador',
      [
        '← Mis eventos',
        'Resumen',
        'Retos',
        'Catálogo',
        'Lugares',
        'Agenda',
        'Sponsors',
        'Preguntas',
      ],
    ],
  ] as const)('%s ve: %j', async (rol, esperado) => {
    TestBed.inject(EventoActualService).set(buildEvento(rol));
    expect(TestBed.inject(ContextoEventoService).rol()).toBe(rol);
    const fixture = TestBed.createComponent(EventoLayout);
    await fixture.whenStable();
    const textos = [...(fixture.nativeElement as HTMLElement).querySelectorAll('nav a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(textos.filter((t) => t !== 'Mi cuenta')).toEqual(esperado);
  });
});
