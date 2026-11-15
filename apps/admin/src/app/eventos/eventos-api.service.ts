import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { RolEvento } from '@pasitos/dominio';
import type { ItemChequeo } from '@pasitos/dominio/esquemas';
import { firstValueFrom } from 'rxjs';

export interface EventoResumen {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly tipo: 'real' | 'demo' | 'prueba';
  readonly estado: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly zonaHoraria: string;
  readonly organizacion: { readonly id: string; readonly nombre: string };
  readonly miRol: RolEvento;
}

export interface EventoDetalle {
  readonly id: string;
  readonly organizacionId: string;
  readonly slug: string;
  readonly nombre: string;
  readonly tipo: 'real' | 'demo' | 'prueba';
  readonly estado: string;
  readonly visibilidad: string;
  readonly zonaHoraria: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly publicadoAt: string | null;
  readonly iniciadoAt: string | null;
  readonly nombrePuntos: string;
  readonly miRol: RolEvento;
  readonly stellar: { readonly contratoId: string | null; readonly enlace: string | null };
  readonly contadores: {
    readonly retos: number;
    readonly pantallas: number;
    readonly pantallasConectadas: number;
    readonly mesas: number;
    readonly invitados: number;
  };
}

export interface ListaChequeo {
  readonly completa: boolean;
  readonly items: readonly ItemChequeo[];
}

export interface FilaBitacoraEvento {
  readonly id: string;
  readonly cuando: string;
  readonly quien: { readonly nombre: string; readonly rol: string | null; readonly tipo: string };
  readonly accion: string;
  readonly texto: string;
  readonly objeto: { readonly tipo: string; readonly nombre: string | null } | null;
  readonly antes: Record<string, unknown> | null;
  readonly despues: Record<string, unknown> | null;
  readonly dispositivo: string | null;
}

export interface MiembroEquipo {
  readonly id: string;
  readonly email: string;
  readonly nombre: string | null;
  readonly rol: Exclude<RolEvento, 'dueno'>;
  readonly estado: 'invitado' | 'activo' | 'vencido' | 'revocado';
  readonly topeRegistrosPuerta: number | null;
  readonly invitadoPor: string | null;
  readonly aceptadoAt: string | null;
  readonly terminales: { readonly pantallas: readonly string[]; readonly mesas: readonly string[] };
}

export type TransicionPanel = 'publicar' | 'abrir' | 'pausar' | 'reanudar';

interface Pagina<T> {
  readonly items: readonly T[];
  readonly pagination: { readonly nextCursor: string | null };
}

const BASE = '/api/v1';

/** Eventos del panel (HU-205) y su bitácora (HU-213). */
@Injectable({ providedIn: 'root' })
export class EventosApi {
  private readonly http = inject(HttpClient);

  async listEventos(): Promise<readonly EventoResumen[]> {
    return (await firstValueFrom(this.http.get<Pagina<EventoResumen>>(`${BASE}/eventos`))).items;
  }

  async listOrganizaciones(): Promise<readonly { id: string; nombre: string; estado: string }[]> {
    return (
      await firstValueFrom(
        this.http.get<Pagina<{ id: string; nombre: string; estado: string }>>(
          `${BASE}/organizaciones`,
        ),
      )
    ).items;
  }

  createEvento(
    organizacionId: string,
    datos: { nombre: string; inicioAt: string; finAt: string; zonaHoraria: string },
  ): Promise<{ id: string; slug: string }> {
    return firstValueFrom(
      this.http.post<{ id: string; slug: string }>(
        `${BASE}/organizaciones/${organizacionId}/eventos`,
        datos,
      ),
    );
  }

  getEvento(id: string): Promise<EventoDetalle> {
    return firstValueFrom(this.http.get<EventoDetalle>(`${BASE}/eventos/${id}`));
  }

  getListaChequeo(id: string): Promise<ListaChequeo> {
    return firstValueFrom(this.http.get<ListaChequeo>(`${BASE}/eventos/${id}/lista-de-chequeo`));
  }

  transition(id: string, transicion: TransicionPanel): Promise<EventoDetalle> {
    return firstValueFrom(this.http.post<EventoDetalle>(`${BASE}/eventos/${id}/${transicion}`, {}));
  }

  async listMiembros(eventoId: string): Promise<readonly MiembroEquipo[]> {
    return (
      await firstValueFrom(
        this.http.get<Pagina<MiembroEquipo>>(`${BASE}/eventos/${eventoId}/miembros`),
      )
    ).items;
  }

  inviteMiembro(
    eventoId: string,
    datos: { email: string; nombre?: string; rol: string; topeRegistrosPuerta?: number | null },
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(`${BASE}/eventos/${eventoId}/miembros`, datos),
    );
  }

  updateMiembro(
    id: string,
    datos: { rol?: string; topeRegistrosPuerta?: number | null },
  ): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${BASE}/miembros/${id}`, datos));
  }

  resendMiembro(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${BASE}/miembros/${id}/reenviar`, {}));
  }

  removeMiembro(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/miembros/${id}`));
  }

  listBitacora(
    id: string,
    filtros: { actor?: string; cursor?: string | null },
  ): Promise<Pagina<FilaBitacoraEvento>> {
    let params = new HttpParams();
    if (filtros.actor) params = params.set('actor', filtros.actor);
    if (filtros.cursor) params = params.set('cursor', filtros.cursor);
    return firstValueFrom(
      this.http.get<Pagina<FilaBitacoraEvento>>(`${BASE}/eventos/${id}/bitacora`, { params }),
    );
  }
}
