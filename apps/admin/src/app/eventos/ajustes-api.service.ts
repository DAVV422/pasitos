import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { TipoMotivoAjuste } from '@pasitos/dominio';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

export interface MovimientoAjuste {
  readonly id: string;
  readonly tipo: 'ajuste' | 'otorgado' | 'anulacion';
  readonly puntos: number;
  readonly motivo: string | null;
  readonly detalle: string | null;
  readonly hora: string;
  readonly autor: { readonly id: string; readonly nombre: string | null } | null;
  readonly asistente: { readonly nombre: string; readonly codigo: string };
}

export interface CanjeBuscado {
  readonly id: string;
  readonly comprobante: string;
  readonly estado: 'confirmado' | 'anulado';
  readonly total: number;
  readonly at: string | null;
  readonly asistente: { readonly nombre: string; readonly codigo: string } | null;
}

export interface ResultadoOtorgamiento {
  readonly codigo: string;
  readonly resultado: 'ok' | 'ya_completado' | 'tope' | 'sin_check_in' | 'no_encontrado';
}

function conClave(): { headers: HttpHeaders } {
  return { headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }) };
}

/** El API de *Ajustes* (HU-317): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class AjustesApi {
  private readonly http = inject(HttpClient);

  adjust(
    asistenteId: string,
    puntos: number,
    motivo: { tipo: TipoMotivoAjuste; texto?: string },
  ): Promise<{ saldo: number }> {
    return firstValueFrom(
      this.http.post<{ saldo: number }>(
        `${BASE}/asistentes/${asistenteId}/ajustes`,
        { puntos, motivo },
        conClave(),
      ),
    );
  }

  grant(
    retoId: string,
    asistentes: readonly string[],
  ): Promise<{ resultados: ResultadoOtorgamiento[] }> {
    return firstValueFrom(
      this.http.post<{ resultados: ResultadoOtorgamiento[] }>(
        `${BASE}/retos/${retoId}/otorgamientos`,
        { asistentes },
        conClave(),
      ),
    );
  }

  cancelCanje(canjeId: string, motivo: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${BASE}/canjes/${canjeId}/anular`, { motivo }, conClave()),
    );
  }

  async searchCanjes(eventoId: string, q: string): Promise<readonly CanjeBuscado[]> {
    const params = new HttpParams().set('q', q);
    return (
      await firstValueFrom(
        this.http.get<{ items: CanjeBuscado[] }>(`${BASE}/eventos/${eventoId}/canjes`, { params }),
      )
    ).items;
  }

  async list(eventoId: string, tipo?: string): Promise<readonly MovimientoAjuste[]> {
    const params = tipo ? new HttpParams().set('tipo', tipo) : new HttpParams();
    return (
      await firstValueFrom(
        this.http.get<{ items: MovimientoAjuste[] }>(`${BASE}/eventos/${eventoId}/ajustes`, {
          params,
        }),
      )
    ).items;
  }
}
