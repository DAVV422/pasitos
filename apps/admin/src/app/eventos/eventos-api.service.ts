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

/** Reglas de la puerta y de los puntos (HU-212). */
export interface ReglasEvento {
  readonly registroPuertaActivo: boolean;
  readonly topeRegistrosPuerta: number | null;
  readonly puntosCheckIn: number;
  readonly retosRequierenCheckIn: boolean;
  readonly topePuntosPersona: number | null;
  readonly topeAjuste: number;
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
  readonly reglas: ReglasEvento;
  readonly descripcion: string | null;
  readonly contacto: string | null;
  readonly wifi: string | null;
  readonly seccionesPublicas: readonly string[];
  readonly imagenes: {
    readonly logoArchivoId: string | null;
    readonly portadaArchivoId: string | null;
    readonly planoArchivoId: string | null;
  };
  readonly ubicacion: {
    readonly nombre: string | null;
    readonly direccion: string | null;
    readonly lat: number | null;
    readonly lng: number | null;
    readonly mapaEstaticoArchivoId: string | null;
  };
  readonly miRol: RolEvento;
  readonly stellar: { readonly contratoId: string | null; readonly enlace: string | null };
  readonly contadores: {
    readonly retos: number;
    readonly pantallas: number;
    readonly pantallasConectadas: number;
    readonly mesas: number;
    readonly invitados: number;
    /** Registrados en la puerta (HU-210). */
    readonly registrosPuerta?: number;
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

/** Una fila de lugares, agenda, sponsors o preguntas: campos según el recurso. */
export type FilaContenido = { readonly id: string } & Readonly<Record<string, unknown>>;

/** Una pantalla o una mesa en el panel (HU-209). Las de mesa no tienen número ni Stellar. */
export interface TerminalPanel {
  readonly id: string;
  readonly numero?: number;
  readonly nombre: string;
  readonly lugar: { readonly id: string; readonly nombre: string } | null;
  readonly estado: string;
  readonly conexion: 'en_linea' | 'sin_conexion' | 'desconectada';
  readonly conectadaPor: { readonly nombre: string } | null;
  readonly conectadaAt: string | null;
  readonly registradaEnStellarAt?: string | null;
  readonly reemplazadaPor?: string | null;
  readonly reemplazaA?: string | null;
  readonly motivoReemplazo?: string | null;
  readonly operadores: readonly string[];
}

export interface ConexionTerminal {
  readonly qr: string;
  readonly enlace: string;
  readonly expiraQrAt: string;
  readonly expiraEnlaceAt: string;
}

const RUTA_TERMINAL = { pantalla: 'pantallas', mesa: 'mesas' } as const;

export interface PremioPanel {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagenArchivoId: string | null;
  readonly puntos: number;
  readonly stockTotal: number;
  readonly stockReservado: number;
  readonly stockEntregado: number;
  readonly disponible: number;
  readonly maxPorPersona: number | null;
  readonly estado: 'activo' | 'oculto';
}

export interface RetoPanel {
  readonly id: string;
  readonly numero: number;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly tipo: 'qr' | 'otorgado';
  readonly modoQr: 'por_tiempo' | 'un_uso';
  readonly rotacionSegundos: 15 | 30 | 60;
  readonly puntos: number;
  readonly topeTotal: number;
  readonly vecesPorPersona: number;
  readonly lugarId: string | null;
  readonly disponibleDesde: string | null;
  readonly disponibleHasta: string | null;
  readonly sponsorId: string | null;
  readonly estado: 'activo' | 'desactivado';
  readonly entregados: number;
  readonly registradoEnStellar: boolean;
  readonly lugar?: { readonly id: string; readonly nombre: string } | null;
  readonly tienePantalla?: boolean;
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

  updateEvento(id: string, cambios: Record<string, unknown>): Promise<EventoDetalle> {
    return firstValueFrom(this.http.patch<EventoDetalle>(`${BASE}/eventos/${id}`, cambios));
  }

  updateUbicacion(
    id: string,
    datos: { nombre: string; direccion: string; lat: number | null; lng: number | null },
  ): Promise<unknown> {
    return firstValueFrom(this.http.put(`${BASE}/eventos/${id}/ubicacion`, datos));
  }

  async listContenido(eventoId: string, recurso: string): Promise<readonly FilaContenido[]> {
    return (
      await firstValueFrom(
        this.http.get<Pagina<FilaContenido>>(`${BASE}/eventos/${eventoId}/${recurso}`),
      )
    ).items;
  }

  createContenido(
    eventoId: string,
    recurso: string,
    datos: Record<string, unknown>,
  ): Promise<FilaContenido> {
    return firstValueFrom(
      this.http.post<FilaContenido>(`${BASE}/eventos/${eventoId}/${recurso}`, datos),
    );
  }

  updateContenido(
    recurso: string,
    id: string,
    datos: Record<string, unknown>,
  ): Promise<FilaContenido> {
    return firstValueFrom(this.http.patch<FilaContenido>(`${BASE}/${recurso}/${id}`, datos));
  }

  deleteContenido(recurso: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${recurso}/${id}`));
  }

  async reorderContenido(
    eventoId: string,
    recurso: string,
    ids: readonly string[],
  ): Promise<readonly FilaContenido[]> {
    return (
      await firstValueFrom(
        this.http.put<Pagina<FilaContenido>>(`${BASE}/eventos/${eventoId}/${recurso}/orden`, {
          ids,
        }),
      )
    ).items;
  }

  async listRetos(eventoId: string): Promise<readonly RetoPanel[]> {
    return (
      await firstValueFrom(this.http.get<Pagina<RetoPanel>>(`${BASE}/eventos/${eventoId}/retos`))
    ).items;
  }

  createReto(eventoId: string, datos: Record<string, unknown>): Promise<RetoPanel> {
    return firstValueFrom(this.http.post<RetoPanel>(`${BASE}/eventos/${eventoId}/retos`, datos));
  }

  updateReto(id: string, datos: Record<string, unknown>): Promise<RetoPanel> {
    return firstValueFrom(this.http.patch<RetoPanel>(`${BASE}/retos/${id}`, datos));
  }

  deleteReto(id: string): Promise<{ desactivado: boolean }> {
    return firstValueFrom(this.http.delete<{ desactivado: boolean }>(`${BASE}/retos/${id}`));
  }

  setRetoActivo(id: string, activo: boolean): Promise<RetoPanel> {
    return firstValueFrom(
      this.http.post<RetoPanel>(`${BASE}/retos/${id}/${activo ? 'activar' : 'desactivar'}`, {}),
    );
  }

  async listPremios(eventoId: string): Promise<readonly PremioPanel[]> {
    return (
      await firstValueFrom(
        this.http.get<Pagina<PremioPanel>>(`${BASE}/eventos/${eventoId}/premios`),
      )
    ).items;
  }

  createPremio(eventoId: string, datos: Record<string, unknown>): Promise<PremioPanel> {
    return firstValueFrom(
      this.http.post<PremioPanel>(`${BASE}/eventos/${eventoId}/premios`, datos),
    );
  }

  updatePremio(id: string, datos: Record<string, unknown>): Promise<PremioPanel> {
    return firstValueFrom(this.http.patch<PremioPanel>(`${BASE}/premios/${id}`, datos));
  }

  deletePremio(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/premios/${id}`));
  }

  setPremioVisible(id: string, visible: boolean): Promise<PremioPanel> {
    return firstValueFrom(
      this.http.post<PremioPanel>(`${BASE}/premios/${id}/${visible ? 'mostrar' : 'ocultar'}`, {}),
    );
  }

  async listTerminales(
    eventoId: string,
    tipo: 'pantalla' | 'mesa',
  ): Promise<readonly TerminalPanel[]> {
    return (
      await firstValueFrom(
        this.http.get<Pagina<TerminalPanel>>(`${BASE}/eventos/${eventoId}/${RUTA_TERMINAL[tipo]}`),
      )
    ).items;
  }

  createTerminal(
    eventoId: string,
    tipo: 'pantalla' | 'mesa',
    datos: Record<string, unknown>,
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(`${BASE}/eventos/${eventoId}/${RUTA_TERMINAL[tipo]}`, datos),
    );
  }

  updateTerminal(
    id: string,
    tipo: 'pantalla' | 'mesa',
    datos: Record<string, unknown>,
  ): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${BASE}/${RUTA_TERMINAL[tipo]}/${id}`, datos));
  }

  createConexion(
    id: string,
    tipo: 'pantalla' | 'mesa',
    motivo?: string,
  ): Promise<ConexionTerminal> {
    return firstValueFrom(
      this.http.post<ConexionTerminal>(
        `${BASE}/${RUTA_TERMINAL[tipo]}/${id}/conexion`,
        motivo ? { motivo } : {},
      ),
    );
  }

  disconnectTerminal(id: string, tipo: 'pantalla' | 'mesa'): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${RUTA_TERMINAL[tipo]}/${id}/conexion`));
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
    datos: {
      email: string;
      nombre?: string;
      rol: string;
      topeRegistrosPuerta?: number | null;
      terminales?: { pantallas?: readonly string[]; mesas?: readonly string[] };
    },
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(`${BASE}/eventos/${eventoId}/miembros`, datos),
    );
  }

  updateMiembro(
    id: string,
    datos: {
      rol?: string;
      topeRegistrosPuerta?: number | null;
      terminales?: { pantallas?: readonly string[]; mesas?: readonly string[] };
    },
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
