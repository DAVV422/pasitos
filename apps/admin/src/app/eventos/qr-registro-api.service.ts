import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { EstadoQrRegistro, MuestraQrRegistro, TipoQrRegistro } from '@pasitos/dominio';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

/** Un QR de registro en el panel (HU-319). Nunca trae el token ni el secreto. */
export interface QrRegistroPanel {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoQrRegistro;
  readonly muestra: MuestraQrRegistro;
  readonly usuario: { readonly id: string; readonly nombre: string } | null;
  readonly pantalla: { readonly id: string; readonly nombre: string } | null;
  readonly grupoId: string | null;
  readonly marcaPresente: boolean;
  readonly tope: number | null;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly estado: EstadoQrRegistro;
  readonly registros: number;
  readonly ultimaHora: number;
  readonly invalidadoAt: string | null;
  readonly motivoInvalidacion: string | null;
  readonly createdAt: string;
}

/** La franja del rotativo para *Activar cuentas* y la tablet. */
export interface FranjaQrRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly disponibilidad: EstadoQrRegistro | 'autoregistro_apagado' | 'evento_no_activo';
  readonly url: string | null;
  readonly franja: number | null;
  readonly validoHasta: number | null;
  readonly horaServidor: number;
  readonly registros: number;
  readonly tope: number | null;
  readonly ultimas: readonly { readonly nombre: string; readonly at: string }[];
}

/** El API de los QR de registro (HU-319): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class QrRegistroApi {
  private readonly http = inject(HttpClient);

  async list(eventoId: string): Promise<readonly QrRegistroPanel[]> {
    return (
      await firstValueFrom(
        this.http.get<{ items: QrRegistroPanel[] }>(`${BASE}/eventos/${eventoId}/qr-registro`),
      )
    ).items;
  }

  async listMios(eventoId: string): Promise<readonly QrRegistroPanel[]> {
    return (
      await firstValueFrom(
        this.http.get<{ items: QrRegistroPanel[] }>(`${BASE}/eventos/${eventoId}/qr-registro/mios`),
      )
    ).items;
  }

  create(eventoId: string, datos: Record<string, unknown>): Promise<QrRegistroPanel> {
    return firstValueFrom(
      this.http.post<QrRegistroPanel>(`${BASE}/eventos/${eventoId}/qr-registro`, datos),
    );
  }

  update(id: string, datos: Record<string, unknown>): Promise<QrRegistroPanel> {
    return firstValueFrom(this.http.patch<QrRegistroPanel>(`${BASE}/qr-registro/${id}`, datos));
  }

  invalidate(id: string, motivo: string): Promise<QrRegistroPanel> {
    return firstValueFrom(
      this.http.post<QrRegistroPanel>(`${BASE}/qr-registro/${id}/invalidar`, { motivo }),
    );
  }

  duplicate(id: string): Promise<QrRegistroPanel> {
    return firstValueFrom(
      this.http.post<QrRegistroPanel>(`${BASE}/qr-registro/${id}/duplicar`, {}),
    );
  }

  getImprimible(id: string, formato: 'png' | 'pdf'): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${BASE}/qr-registro/${id}/imprimible`, {
        params: new HttpParams().set('formato', formato),
        responseType: 'blob',
      }),
    );
  }

  getFranja(id: string): Promise<FranjaQrRegistro> {
    return firstValueFrom(this.http.get<FranjaQrRegistro>(`${BASE}/qr-registro/${id}/franja`));
  }
}
