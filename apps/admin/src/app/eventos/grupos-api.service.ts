import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ColorGrupo } from '@pasitos/dominio';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

/** Un grupo en el panel (HU-325): cuántas personas, retos, premios y QR lo usan. */
export interface GrupoPanel {
  readonly id: string;
  readonly nombre: string;
  readonly color: ColorGrupo;
  readonly personas: number;
  readonly retos: number;
  readonly premios: number;
  readonly qrRegistro: number;
}

export interface ResultadoMiembros {
  readonly agregados: readonly string[];
  readonly yaEstaban: readonly string[];
  readonly noEncontrados: readonly string[];
}

/** El API de los grupos (HU-325): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class GruposApi {
  private readonly http = inject(HttpClient);

  async list(eventoId: string): Promise<readonly GrupoPanel[]> {
    return (
      await firstValueFrom(
        this.http.get<{ items: GrupoPanel[] }>(`${BASE}/eventos/${eventoId}/grupos`),
      )
    ).items;
  }

  create(eventoId: string, datos: { nombre: string; color: ColorGrupo }): Promise<GrupoPanel> {
    return firstValueFrom(this.http.post<GrupoPanel>(`${BASE}/eventos/${eventoId}/grupos`, datos));
  }

  update(id: string, datos: { nombre?: string; color?: ColorGrupo }): Promise<GrupoPanel> {
    return firstValueFrom(this.http.patch<GrupoPanel>(`${BASE}/grupos/${id}`, datos));
  }

  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/grupos/${id}`));
  }

  addMiembros(id: string, codigos: readonly string[]): Promise<ResultadoMiembros> {
    return firstValueFrom(
      this.http.post<ResultadoMiembros>(`${BASE}/grupos/${id}/miembros`, { asistentes: codigos }),
    );
  }

  async removeMiembro(id: string, asistenteId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/grupos/${id}/miembros/${asistenteId}`));
  }
}
