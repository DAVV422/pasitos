import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AccionPantalla = 'generar_otro' | 'pausar' | 'reanudar' | 'cambiar_reto';

export interface PantallaEnVivo {
  readonly id: string;
  readonly numero: number;
  readonly nombre: string;
  readonly estado: 'activa' | 'pausada' | 'agotado' | 'espera' | 'evento_no_activo';
  readonly conectada: boolean;
  readonly reto: {
    readonly id: string;
    readonly nombre: string;
    readonly entregados: number;
    readonly tope: number;
  } | null;
  readonly fijado: boolean;
  readonly opciones: readonly { readonly id: string; readonly nombre: string }[];
}

export interface HistorialPantalla {
  readonly qr: readonly {
    readonly inicioAt: string;
    readonly finAt: string | null;
    readonly modo: string;
    readonly franja: number | null;
    readonly finMotivo: string | null;
    readonly reto: string;
    readonly invalidadoPor: string | null;
  }[];
  readonly aceptados: number;
  readonly rechazos: readonly { readonly resultado: string; readonly total: number }[];
}

/** El API de *Mis pantallas* (HU-315): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class PantallasControlApi {
  private readonly http = inject(HttpClient);

  async list(eventoId: string): Promise<readonly PantallaEnVivo[]> {
    return (
      await firstValueFrom(
        this.http.get<{ items: PantallaEnVivo[] }>(`/api/v1/eventos/${eventoId}/mis-pantallas`),
      )
    ).items;
  }

  control(id: string, accion: AccionPantalla, retoId?: string | null): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`/api/v1/pantallas/${id}/controles`, {
        accion,
        ...(retoId !== undefined ? { retoId } : {}),
      }),
    );
  }

  getHistorial(id: string): Promise<HistorialPantalla> {
    return firstValueFrom(this.http.get<HistorialPantalla>(`/api/v1/pantallas/${id}/historial`));
  }
}
