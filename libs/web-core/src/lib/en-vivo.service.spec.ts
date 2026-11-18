import { TestBed } from '@angular/core/testing';
import {
  CREAR_FUENTE_EVENTOS,
  ESPERA_MAXIMA_MS,
  EnVivoService,
  type FuenteEventos,
} from './en-vivo.service';

/** Un EventSource falso que el test maneja a mano. */
class FuenteFalsa implements FuenteEventos {
  readyState = 0;
  onopen: ((evento: Event) => void) | null = null;
  onerror: ((evento: Event) => void) | null = null;
  cerrada = false;
  private readonly escuchas = new Map<string, ((evento: MessageEvent) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(tipo: string, escucha: (evento: MessageEvent) => void): void {
    this.escuchas.set(tipo, [...(this.escuchas.get(tipo) ?? []), escucha]);
  }
  close(): void {
    this.cerrada = true;
    this.readyState = 2;
  }
  abrir(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  emitir(tipo: string, datos: unknown, id: string): void {
    for (const escucha of this.escuchas.get(tipo) ?? []) {
      escucha(new MessageEvent(tipo, { data: JSON.stringify(datos), lastEventId: id }));
    }
  }
  /** El servidor respondió con error: el navegador no reconecta solo. */
  fallar(): void {
    this.readyState = 2;
    this.onerror?.(new Event('error'));
  }
}

describe('EnVivoService (T-301 §3)', () => {
  let fuentes: FuenteFalsa[];

  beforeEach(() => {
    vi.useFakeTimers();
    fuentes = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CREAR_FUENTE_EVENTOS,
          useValue: (url: string) => {
            const fuente = new FuenteFalsa(url);
            fuentes.push(fuente);
            return fuente;
          },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('entrega los avisos con sus datos y su id', () => {
    const canal = TestBed.inject(EnVivoService).connect('/api/v1/app/en-vivo', [
      'saldo.actualizado',
    ]);
    const recibidos: unknown[] = [];
    canal.on('saldo.actualizado', (aviso) => recibidos.push(aviso));
    fuentes[0]?.abrir();
    expect(canal.estado()).toBe('abierta');
    fuentes[0]?.emitir('saldo.actualizado', { saldo: 80 }, '01J1');
    expect(recibidos).toEqual([{ id: '01J1', evento: 'saldo.actualizado', datos: { saldo: 80 } }]);
    canal.close();
  });

  it('si el servidor corta con error, reconecta con espera creciente y ?ultimo=', () => {
    const canal = TestBed.inject(EnVivoService).connect('/api/v1/sala/en-vivo', ['pantalla.epoca']);
    fuentes[0]?.abrir();
    fuentes[0]?.emitir('pantalla.epoca', {}, '01J9');
    fuentes[0]?.fallar();
    expect(canal.estado()).toBe('esperando');
    vi.advanceTimersByTime(999);
    expect(fuentes).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fuentes[1]?.url).toBe('/api/v1/sala/en-vivo?ultimo=01J9');
    fuentes[1]?.fallar();
    vi.advanceTimersByTime(1_999);
    expect(fuentes).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(fuentes).toHaveLength(3);
    // Nunca espera más de 30 s.
    for (let i = 0; i < 10; i++) {
      fuentes.at(-1)?.fallar();
      vi.advanceTimersByTime(ESPERA_MAXIMA_MS);
    }
    expect(fuentes.length).toBeGreaterThan(10);
    canal.close();
  });

  it('avisa reiniciar para que la pantalla pida la foto completa', () => {
    const canal = TestBed.inject(EnVivoService).connect('/api/v1/mesa/en-vivo', []);
    let reiniciar = 0;
    canal.on('reiniciar', () => reiniciar++);
    fuentes[0]?.emitir('reiniciar', {}, '');
    expect(reiniciar).toBe(1);
    canal.close();
  });

  it('al cerrarla no reconecta más', () => {
    const canal = TestBed.inject(EnVivoService).connect('/api/v1/app/en-vivo', []);
    canal.close();
    expect(fuentes[0]?.cerrada).toBe(true);
    fuentes[0]?.fallar();
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS);
    expect(fuentes).toHaveLength(1);
  });
});
