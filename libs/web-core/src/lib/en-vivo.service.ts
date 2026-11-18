import { DestroyRef, inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';

/** Un aviso en vivo recibido (T-301): el nombre del evento SSE y sus datos. */
export interface AvisoRecibido {
  readonly id: string | null;
  readonly evento: string;
  readonly datos: unknown;
}

export type EstadoEnVivo = 'conectando' | 'abierta' | 'esperando';

/** Lo mínimo de `EventSource` que se usa (para probarlo sin navegador). */
export interface FuenteEventos {
  readonly readyState: number;
  addEventListener(tipo: string, escucha: (evento: MessageEvent) => void): void;
  close(): void;
  onopen: ((evento: Event) => void) | null;
  onerror: ((evento: Event) => void) | null;
}

export const CREAR_FUENTE_EVENTOS = new InjectionToken<(url: string) => FuenteEventos>(
  'CREAR_FUENTE_EVENTOS',
  { providedIn: 'root', factory: () => (url: string) => new EventSource(url) },
);

/** Espera entre reconexiones: 1, 2, 4… hasta 30 s (T-301 §3). */
export const ESPERA_MAXIMA_MS = 30_000;
const CERRADA = 2;

/**
 * Una conexión a un canal en vivo. El `EventSource` del navegador reconecta solo cuando se corta
 * la red (con `Last-Event-ID`); si el servidor responde con error, lo cierra: ahí reconecta esta
 * clase, con espera creciente y `?ultimo=` para no perder nada.
 */
export class ConexionEnVivo {
  private readonly estadoActual = signal<EstadoEnVivo>('conectando');
  readonly estado: Signal<EstadoEnVivo> = this.estadoActual.asReadonly();
  private fuente: FuenteEventos | null = null;
  private ultimoId: string | null = null;
  private espera = 1_000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cerrada = false;
  private readonly escuchas = new Map<string, Set<(aviso: AvisoRecibido) => void>>();
  private readonly alVolver = () => this.reconnectNow();
  private readonly alVerse = () => {
    if (document.visibilityState === 'visible') this.reconnectNow();
  };

  constructor(
    private readonly url: string,
    private readonly eventos: readonly string[],
    private readonly crear: (url: string) => FuenteEventos,
  ) {
    globalThis.addEventListener?.('online', this.alVolver);
    globalThis.document?.addEventListener('visibilitychange', this.alVerse);
    this.open();
  }

  /** Escucha un evento (`saldo.actualizado`, `reiniciar`…). Devuelve cómo dejar de escuchar. */
  on(evento: string, escucha: (aviso: AvisoRecibido) => void): () => void {
    const escuchas = this.escuchas.get(evento) ?? new Set();
    escuchas.add(escucha);
    this.escuchas.set(evento, escuchas);
    return () => escuchas.delete(escucha);
  }

  close(): void {
    this.cerrada = true;
    if (this.timer) clearTimeout(this.timer);
    this.fuente?.close();
    globalThis.removeEventListener?.('online', this.alVolver);
    globalThis.document?.removeEventListener('visibilitychange', this.alVerse);
  }

  private open(): void {
    if (this.cerrada) return;
    if (globalThis.navigator?.onLine === false) {
      this.estadoActual.set('esperando');
      return;
    }
    this.estadoActual.set('conectando');
    const separador = this.url.includes('?') ? '&' : '?';
    const url = this.ultimoId ? `${this.url}${separador}ultimo=${this.ultimoId}` : this.url;
    const fuente = this.crear(url);
    this.fuente = fuente;
    fuente.onopen = () => {
      this.espera = 1_000;
      this.estadoActual.set('abierta');
    };
    fuente.onerror = () => {
      if (fuente.readyState !== CERRADA) {
        // El navegador reconecta solo.
        this.estadoActual.set('conectando');
        return;
      }
      this.scheduleReconnect();
    };
    for (const evento of [...this.eventos, 'reiniciar']) {
      fuente.addEventListener(evento, (mensaje) => this.emit(evento, mensaje));
    }
  }

  private emit(evento: string, mensaje: MessageEvent): void {
    if (mensaje.lastEventId) this.ultimoId = mensaje.lastEventId;
    let datos: unknown = null;
    try {
      datos = JSON.parse(String(mensaje.data));
    } catch {
      datos = null;
    }
    const aviso: AvisoRecibido = { id: mensaje.lastEventId || null, evento, datos };
    for (const escucha of this.escuchas.get(evento) ?? []) escucha(aviso);
  }

  private scheduleReconnect(): void {
    this.fuente?.close();
    this.fuente = null;
    if (this.cerrada) return;
    this.estadoActual.set('esperando');
    const espera = this.espera;
    this.espera = Math.min(this.espera * 2, ESPERA_MAXIMA_MS);
    this.timer = setTimeout(() => this.open(), espera);
  }

  private reconnectNow(): void {
    if (this.cerrada || this.fuente) return;
    if (this.timer) clearTimeout(this.timer);
    this.espera = 1_000;
    this.open();
  }
}

/**
 * Avisos en vivo (T-301, API §8). Cada pantalla abre su canal y escucha los eventos que le
 * importan; al destruirse el componente, la conexión se cierra.
 *
 *   const canal = inject(EnVivoService).connect('/api/v1/app/en-vivo', ['saldo.actualizado']);
 *   canal.on('saldo.actualizado', (a) => this.saldo.set((a.datos as { saldo: number }).saldo));
 */
@Injectable({ providedIn: 'root' })
export class EnVivoService {
  private readonly crear = inject(CREAR_FUENTE_EVENTOS);

  connect(url: string, eventos: readonly string[], destruir?: DestroyRef): ConexionEnVivo {
    const conexion = new ConexionEnVivo(url, eventos, this.crear);
    destruir?.onDestroy(() => conexion.close());
    return conexion;
  }
}
