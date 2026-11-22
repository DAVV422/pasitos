import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1/mesa';

/** Un premio del catálogo de la mesa (HU-316 §2). */
export interface PremioMesa {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagenUrl: string | null;
  readonly puntos: number;
  readonly disponible: number;
  readonly pocos: boolean;
  /** HU-413: *"Desde las 15:00"* o *"Ya no está disponible"*; `null` si se puede ahora. */
  readonly fueraDeHorario: string | null;
  readonly maxPorPersona: number | null;
  /** HU-325: solo para un grupo. */
  readonly grupo: string | null;
}

export interface ItemCobro {
  readonly premioId: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly puntos: number;
  /** HU-325: el grupo del premio; al confirmar, la persona es del grupo. */
  readonly grupo: string | null;
}

export interface CobroGenerado {
  readonly id: string;
  readonly qr: string;
  readonly comprobante: string;
  readonly total: number;
  readonly expiraAt: string;
  readonly items: readonly ItemCobro[];
}

export interface EstadoCobro {
  readonly id: string;
  readonly estado: 'pendiente' | 'confirmado' | 'vencido' | 'cancelado' | 'anulado';
  readonly comprobante: string;
  readonly total: number;
  readonly expiraAt: string;
  readonly items: readonly ItemCobro[];
  readonly asistente: { readonly nombre: string; readonly codigo: string } | null;
  readonly confirmadoAt: string | null;
  readonly requiereCi: boolean;
  /** HU-321: el carnet de quien pagó, enmascarado, para compararlo antes de entregar. */
  readonly carnet?: { readonly ci: string | null; readonly verificado: boolean } | null;
}

export interface CanjeDelDia {
  readonly id: string;
  readonly estado: string;
  readonly comprobante: string;
  readonly total: number;
  readonly at: string;
  readonly asistente: { readonly nombre: string; readonly codigo: string } | null;
  readonly items: readonly ItemCobro[];
}

/** El API de la mesa: ningún componente usa HttpClient directo (AGENTS.md). */
@Injectable({ providedIn: 'root' })
export class MesaApi {
  private readonly http = inject(HttpClient);

  async getCatalogo(): Promise<readonly PremioMesa[]> {
    return (await firstValueFrom(this.http.get<{ items: PremioMesa[] }>(`${BASE}/catalogo`))).items;
  }

  /** La misma clave en un doble toque: un solo cobro. */
  createCobro(
    items: readonly { premioId: string; cantidad: number }[],
    clave: string,
  ): Promise<CobroGenerado> {
    return firstValueFrom(
      this.http.post<CobroGenerado>(
        `${BASE}/cobros`,
        { items },
        { headers: new HttpHeaders({ 'Idempotency-Key': clave }) },
      ),
    );
  }

  getCobro(id: string): Promise<EstadoCobro> {
    return firstValueFrom(this.http.get<EstadoCobro>(`${BASE}/cobros/${id}`));
  }

  cancel(id: string): Promise<{ id: string; estado: string }> {
    return firstValueFrom(
      this.http.post<{ id: string; estado: string }>(`${BASE}/cobros/${id}/cancelar`, {}),
    );
  }

  async listHistorial(): Promise<readonly CanjeDelDia[]> {
    return (await firstValueFrom(this.http.get<{ items: CanjeDelDia[] }>(`${BASE}/historial`)))
      .items;
  }
}
