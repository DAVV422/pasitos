import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { EnVivoService, type ConexionEnVivo } from '@pasitos/web-core';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

export interface PendientesFotos {
  readonly puedeRevisar: boolean;
  readonly total: number;
  readonly items: readonly {
    readonly retoId: string;
    readonly nombre: string;
    readonly pendientes: number;
  }[];
}

/** La foto que se revisa ahora (HU-323 §2). */
export interface FotoParaRevisar {
  readonly envio: { readonly id: string; readonly retoId: string; readonly reto: string };
  readonly foto: { readonly url1200: string };
  readonly asistente: { readonly nombre: string; readonly codigo: string };
  readonly intento: number;
  readonly intentosAnteriores: readonly { readonly motivo: string | null }[];
  readonly origen: 'camara' | 'galeria';
  readonly autorizaUso: boolean;
  readonly enviadaAt: string;
  readonly puntos: number;
}

export type ResultadoRevision =
  | { readonly estado: 'aprobada'; readonly puntos: number; readonly asistente: string }
  | { readonly estado: 'rechazada'; readonly motivo: string; readonly asistente: string };

export type MotivoRechazo = 'no_corresponde' | 'no_se_ve' | 'repetida' | 'inapropiada' | 'otro';

/** El API de las fotos de los retos (HU-323): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class FotosApi {
  private readonly http = inject(HttpClient);

  pendientes(eventoId: string): Promise<PendientesFotos> {
    return firstValueFrom(
      this.http.get<PendientesFotos>(`${BASE}/eventos/${eventoId}/fotos/pendientes`),
    );
  }

  /** `null` sin pendientes (`204`). */
  async next(eventoId: string, retoId: string | null): Promise<FotoParaRevisar | null> {
    return (
      (await firstValueFrom(
        this.http.post<FotoParaRevisar | null>(
          `${BASE}/eventos/${eventoId}/fotos/siguiente`,
          retoId ? { retoId } : {},
        ),
      )) ?? null
    );
  }

  approve(id: string): Promise<ResultadoRevision> {
    return firstValueFrom(
      this.http.post<ResultadoRevision>(`${BASE}/fotos/${id}/aprobar`, null, {
        headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
      }),
    );
  }

  reject(id: string, motivo: MotivoRechazo, nota?: string): Promise<ResultadoRevision> {
    return firstValueFrom(
      this.http.post<ResultadoRevision>(`${BASE}/fotos/${id}/rechazar`, {
        motivo,
        ...(nota ? { nota } : {}),
      }),
    );
  }

  async release(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BASE}/fotos/${id}/soltar`, {}));
  }
}

/**
 * Las fotos por revisar de esta persona (HU-323 §3): el contador del menú y si le toca revisar
 * (dueño, coorganizador o responsable de algún reto). Se actualiza con `foto.recibida`.
 */
@Injectable({ providedIn: 'root' })
export class FotosPendientesService {
  private readonly api = inject(FotosApi);
  private readonly enVivo = inject(EnVivoService);
  readonly pendientes = signal<PendientesFotos | null>(null);
  private conexion: ConexionEnVivo | null = null;
  private eventoId: string | null = null;

  watch(eventoId: string, destroy: DestroyRef): void {
    if (this.eventoId === eventoId) return;
    this.conexion?.close();
    this.eventoId = eventoId;
    void this.refresh();
    this.conexion = this.enVivo.connect(
      `/api/v1/eventos/${eventoId}/en-vivo`,
      ['foto.recibida'],
      destroy,
    );
    this.conexion.on('foto.recibida', () => void this.refresh());
    destroy.onDestroy(() => {
      this.conexion?.close();
      this.conexion = null;
      this.eventoId = null;
    });
  }

  async refresh(): Promise<void> {
    if (!this.eventoId) return;
    const pendientes = await this.api.pendientes(this.eventoId).catch(() => null);
    if (pendientes) this.pendientes.set(pendientes);
  }
}
