import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** `GET /sala/estado` (HU-314 §2). */
export interface EstadoSala {
  readonly pantalla: {
    readonly id: string;
    readonly numero: number;
    readonly nombre: string;
    readonly lugar: string | null;
  };
  readonly estado: 'activa' | 'pausada' | 'agotado' | 'espera' | 'evento_no_activo';
  readonly reto: {
    readonly id: string;
    readonly numero: number;
    readonly nombre: string;
    readonly puntos: number;
    readonly modo: 'por_tiempo' | 'un_uso';
    readonly rotacionSegundos: number;
    readonly entregados: number;
    readonly tope: number;
  } | null;
  readonly proximo: { readonly nombre: string; readonly desde: string } | null;
  readonly epoca: number;
  readonly horaServidor: number;
  readonly evento: { readonly estado: string };
  readonly opciones: readonly { readonly id: string; readonly nombre: string }[];
  readonly fijado: boolean;
}

/** HU-315: los controles de la pantalla. */
export type AccionPantalla = 'generar_otro' | 'pausar' | 'reanudar' | 'cambiar_reto';

/** Un QR que mostró la pantalla (HU-314 §3.6). */
export interface QrEmitido {
  reto: string;
  modo: 'por_tiempo' | 'un_uso';
  epoca: number;
  franja?: number;
  nonce?: string;
  inicioAt: string;
  finAt?: string;
  finMotivo?: 'vencio' | 'usado' | 'invalidado' | 'pausa';
}

/** El API de la pantalla: ningún componente usa HttpClient directo (AGENTS.md). */
@Injectable({ providedIn: 'root' })
export class SalaApi {
  private readonly http = inject(HttpClient);

  getEstado(): Promise<EstadoSala> {
    return firstValueFrom(this.http.get<EstadoSala>('/api/v1/sala/estado'));
  }

  control(accion: AccionPantalla, pin: string, retoId?: string | null): Promise<unknown> {
    return firstValueFrom(
      this.http.post('/api/v1/sala/controles', {
        accion,
        pin,
        ...(retoId !== undefined ? { retoId } : {}),
      }),
    );
  }

  recordEmitidos(items: readonly QrEmitido[]): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/v1/sala/qr-emitidos', { items }));
  }
}
