import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { AvisosService } from '@pasitos/panel';
import { EnVivoService, type ConexionEnVivo } from '@pasitos/web-core';
import { firstValueFrom } from 'rxjs';

export interface AlertaPanel {
  readonly id: string;
  readonly tipo: string;
  readonly estado: 'abierta' | 'atendiendo' | 'derivada' | 'resuelta' | 'descartada';
  readonly prioridad: 'normal' | 'alta';
  readonly at: string;
  readonly asistente: {
    readonly id: string;
    readonly nombre: string;
    readonly codigo: string;
  } | null;
  readonly frase: string;
  readonly modelo: string | null;
  readonly atendidaPor: string | null;
  readonly resolucion: string | null;
}

/** El API de las alertas (HU-318): ningún componente usa HttpClient directo. */
@Injectable({ providedIn: 'root' })
export class AlertasApi {
  private readonly http = inject(HttpClient);

  async list(
    eventoId: string,
    filtros: { tipo?: string; estado?: string } = {},
  ): Promise<readonly AlertaPanel[]> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros))
      if (valor) params = params.set(clave, valor);
    return (
      await firstValueFrom(
        this.http.get<{ items: AlertaPanel[] }>(`/api/v1/eventos/${eventoId}/alertas`, { params }),
      )
    ).items;
  }

  resolve(id: string, resolucion: 'revisada' | 'descartar', nota: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/v1/alertas/${id}/resolver`, { resolucion, nota }));
  }
}

/**
 * Las alertas abiertas del evento para el menú (*Alertas · 2*) y el aviso flotante al llegar una
 * nueva (HU-318 §3). Solo para dueño y coorganizador.
 */
@Injectable({ providedIn: 'root' })
export class AlertasAbiertasService {
  private readonly api = inject(AlertasApi);
  private readonly enVivo = inject(EnVivoService);
  private readonly avisos = inject(AvisosService);
  readonly abiertas = signal(0);
  private conexion: ConexionEnVivo | null = null;
  private eventoId: string | null = null;

  watch(eventoId: string, destroy: DestroyRef): void {
    if (this.eventoId === eventoId) return;
    this.conexion?.close();
    this.eventoId = eventoId;
    void this.refresh();
    this.conexion = this.enVivo.connect(
      `/api/v1/eventos/${eventoId}/en-vivo`,
      ['alerta.creada', 'alerta.actualizada'],
      destroy,
    );
    this.conexion.on('alerta.creada', (aviso) => {
      const tipo = (aviso.datos as { tipo?: string } | null)?.tipo;
      this.avisos.info(
        tipo === 'no_fui_yo' ? 'Nuevo aviso «No fui yo».' : `Nueva alerta ${tipo ?? ''}.`,
      );
      void this.refresh();
    });
    this.conexion.on('alerta.actualizada', () => void this.refresh());
    destroy.onDestroy(() => {
      this.conexion?.close();
      this.conexion = null;
      this.eventoId = null;
    });
  }

  async refresh(): Promise<void> {
    if (!this.eventoId) return;
    const lista = await this.api.list(this.eventoId).catch(() => null);
    if (lista) this.abiertas.set(lista.length);
  }
}
