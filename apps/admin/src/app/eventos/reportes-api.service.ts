import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DatosReporte, ReportePanel, TramoReporte } from '@pasitos/dominio';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

/** El reporte del evento cerrado (HU-402). */
@Injectable({ providedIn: 'root' })
export class ReportesApi {
  private readonly http = inject(HttpClient);

  get(eventoId: string): Promise<ReportePanel> {
    return firstValueFrom(this.http.get<ReportePanel>(`${BASE}/eventos/${eventoId}/reporte`));
  }

  getTramo(eventoId: string, tramo: TramoReporte): Promise<DatosReporte> {
    return firstValueFrom(
      this.http.get<DatosReporte>(`${BASE}/eventos/${eventoId}/reporte/tramo`, {
        params: new HttpParams().set('desde', tramo.desde).set('hasta', tramo.hasta),
      }),
    );
  }

  /** El PDF es siempre del evento completo; el CSV, del tramo si se da. */
  download(eventoId: string, formato: 'pdf' | 'csv', tramo: TramoReporte | null): Promise<Blob> {
    let params = new HttpParams();
    if (tramo && formato === 'csv')
      params = params.set('desde', tramo.desde).set('hasta', tramo.hasta);
    return firstValueFrom(
      this.http.get(`${BASE}/eventos/${eventoId}/reporte/${formato}`, {
        params,
        responseType: 'blob',
      }),
    );
  }

  share(eventoId: string, publico: boolean, cambiarEnlace = false): Promise<ReportePanel> {
    return firstValueFrom(
      this.http.patch<ReportePanel>(`${BASE}/eventos/${eventoId}/reporte`, {
        publico,
        ...(cambiarEnlace ? { cambiarEnlace: true } : {}),
      }),
    );
  }

  regenerate(eventoId: string): Promise<ReportePanel> {
    return firstValueFrom(
      this.http.post<ReportePanel>(`${BASE}/eventos/${eventoId}/reporte/regenerar`, {}),
    );
  }
}
