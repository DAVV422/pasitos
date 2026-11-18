import { HttpClient } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
// De la entrada sin Zod: /sala y /mesa no cargan los esquemas (unos 60 KB).
import { LATIDO_MS, MENSAJES_CONEXION } from '@pasitos/dominio';
import { firstValueFrom } from 'rxjs';
import { ErrorApi } from './error-api';

export interface TerminalConectada {
  readonly tipo: 'pantalla' | 'mesa';
  readonly id: string;
  readonly nombre: string;
  readonly lugar: string | null;
  readonly evento: { readonly id: string; readonly nombre: string };
}

export type EstadoTerminal = 'revisando' | 'conectando' | 'conectada' | 'sin_conectar' | 'error';

export interface LlavePublicaTerminal {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
}

/**
 * La sesión de una pantalla o una mesa (HU-209 §4): conectarse con el token de un solo uso y avisar
 * cada 30 s que sigue en línea. La cookie `px_terminal` la maneja el navegador.
 */
@Injectable({ providedIn: 'root' })
export class TerminalService {
  private readonly http = inject(HttpClient);
  private intervalo: ReturnType<typeof setInterval> | null = null;

  readonly estado = signal<EstadoTerminal>('revisando');
  readonly terminal = signal<TerminalConectada | null>(null);
  readonly mensaje = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopLatido());
  }

  async connect(token: string, llavePublica?: LlavePublicaTerminal): Promise<void> {
    this.estado.set('conectando');
    this.mensaje.set(null);
    try {
      const terminal = await firstValueFrom(
        this.http.post<TerminalConectada>('/api/v1/terminales/conectar', {
          token,
          ...(llavePublica ? { llavePublica } : {}),
        }),
      );
      this.setConectada(terminal);
    } catch (error) {
      this.setError(error);
    }
  }

  /** Al abrir la app sin token: ¿esta tablet ya estaba conectada? */
  async check(): Promise<void> {
    try {
      this.setConectada(await this.beat());
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'TERMINAL_DESCONECTADA') {
        this.estado.set('sin_conectar');
      } else {
        this.setError(error);
      }
    }
  }

  private beat(): Promise<TerminalConectada> {
    return firstValueFrom(this.http.post<TerminalConectada>('/api/v1/terminales/latido', {}));
  }

  private setConectada(terminal: TerminalConectada): void {
    this.terminal.set(terminal);
    this.estado.set('conectada');
    this.stopLatido();
    this.intervalo = setInterval(() => {
      this.beat().catch((error: unknown) => {
        // Sin red sigue intentando; desconectada o reemplazada, se detiene y lo dice.
        if (error instanceof ErrorApi && error.code === 'TERMINAL_DESCONECTADA') {
          this.stopLatido();
          this.setError(error);
        }
      });
    }, LATIDO_MS);
  }

  private setError(error: unknown): void {
    const code = error instanceof ErrorApi ? error.code : 'DESCONOCIDO';
    this.estado.set('error');
    this.mensaje.set(
      MENSAJES_CONEXION[code] ??
        (error instanceof ErrorApi ? error.detail : 'No pudimos conectar. Intenta de nuevo.'),
    );
  }

  private stopLatido(): void {
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
  }
}

/** La regla vive en `libs/dominio` (la usa también el API al vincular, HU-306). */
export { isNavegadorDeOtraApp } from '@pasitos/dominio';
