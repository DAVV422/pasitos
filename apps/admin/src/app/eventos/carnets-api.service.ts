import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

/** La ficha para verificar (HU-321): el carnet completo, solo en esta pantalla. */
export interface FichaCarnet {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly ci: string | null;
  readonly presente: boolean;
  readonly verificacion: { readonly at: string; readonly por: string | null } | null;
}

function conClave(): { headers: HttpHeaders } {
  return { headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }) };
}

/** El API de *Verificar carnet* (HU-321): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class CarnetsApi {
  private readonly http = inject(HttpClient);

  async search(eventoId: string, criterio: { qr: string } | { q: string }): Promise<FichaCarnet[]> {
    return (
      await firstValueFrom(
        this.http.post<{ items: FichaCarnet[] }>(
          `${BASE}/eventos/${eventoId}/carnets/buscar`,
          criterio,
        ),
      )
    ).items;
  }

  verify(
    asistenteId: string,
    ci: string | null,
  ): Promise<{ ficha: FichaCarnet; puntos: number; saldo: number }> {
    return firstValueFrom(
      this.http.post<{ ficha: FichaCarnet; puntos: number; saldo: number }>(
        `${BASE}/asistentes/${asistenteId}/carnet/verificar`,
        ci ? { ci } : {},
        conClave(),
      ),
    );
  }

  reject(asistenteId: string, nota: string): Promise<FichaCarnet> {
    return firstValueFrom(
      this.http.post<FichaCarnet>(`${BASE}/asistentes/${asistenteId}/carnet/rechazar`, { nota }),
    );
  }
}
