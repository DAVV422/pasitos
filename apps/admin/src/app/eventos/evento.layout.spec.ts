import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RolEvento } from '@pasitos/dominio';
import { ContextoEventoService } from '@pasitos/panel';
import { AlertasAbiertasService } from './alertas-api.service';
import { FotosPendientesService } from './fotos-api.service';
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
      autoregistroActivo: false,
      pedirCi: 'no',
      pedirCelular: 'opcional',
      verificacionCiActiva: false,
      puntosVerificacionCi: 30,
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
    cierre: { cerradoAt: null, estado: null, programadoAt: null },
    contadores: { retos: 0, pantallas: 0, pantallasConectadas: 0, mesas: 0, invitados: 0 },
  };
}

describe('Menú del evento según el rol (HU-204 §5)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // Sin canal en vivo en las pruebas: el contador de alertas en 0.
        {
          provide: AlertasAbiertasService,
          useValue: { abiertas: signal(0), watch: () => undefined },
        },
        // Sin fotos que revisar: el menú no muestra *Fotos por revisar*.
        {
          provide: FotosPendientesService,
          useValue: { pendientes: signal(null), watch: () => undefined },
        },
      ],
    });
  });

  it.each([
    [
      'dueno',
      [
        '← Mis eventos',
        'Resumen',
        'Configuración',
        'Bitácora',
        'Alertas',
        'Cerrar el evento',
        'Lugares',
        'Mapa',
        'Agenda',
        'Sponsors',
        'Preguntas',
        'Retos',
        'Catálogo',
        'Ajustes',
        'Pantallas',
        'Mesas',
        'Mis pantallas',
        'Puerta',
        'Invitados',
        'QR de registro',
        'Verificar carnet',
        'Equipo',
      ],
    ],
    [
      'coorganizador',
      [
        '← Mis eventos',
        'Resumen',
        'Configuración',
        'Bitácora',
        'Alertas',
        'Lugares',
        'Mapa',
        'Agenda',
        'Sponsors',
        'Preguntas',
        'Retos',
        'Catálogo',
        'Ajustes',
        'Pantallas',
        'Mesas',
        'Mis pantallas',
        'Puerta',
        'Invitados',
        'QR de registro',
        'Verificar carnet',
        'Equipo',
      ],
    ],
    [
      'registrador',
      [
        '← Mis eventos',
        'Resumen',
        'Lugares',
        'Mapa',
        'Agenda',
        'Sponsors',
        'Preguntas',
        'Retos',
        'Catálogo',
        'Puerta',
        'Verificar carnet',
      ],
    ],
    [
      'financiador',
      [
        '← Mis eventos',
        'Resumen',
        'Lugares',
        'Mapa',
        'Agenda',
        'Sponsors',
        'Preguntas',
        'Retos',
        'Catálogo',
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
