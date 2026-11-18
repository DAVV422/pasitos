import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { EstadoRetoAsistente, TipoAcceso } from '@pasitos/dominio';
import type { LlavePublicaEc } from '@pasitos/firmas';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

/** Lo que muestra la bienvenida antes de *Entrar* (API §5.1). */
export interface AccesoVisto {
  readonly evento: {
    readonly nombre: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly logoUrl: string | null;
  };
  readonly asistente: { readonly nombre: string };
  readonly terminos: { readonly version: string; readonly privacidad: string };
  readonly yaVinculado: boolean;
}

/** `GET /app/estado` (HU-308 §1): lo que cambia. */
export interface EstadoApp {
  readonly asistente: {
    readonly codigo: string;
    readonly nombre: string;
    readonly estado: string;
    readonly grupos: readonly string[];
    readonly ci: { readonly cargado: boolean; readonly verificado: boolean };
  };
  readonly saldo: number;
  readonly evento: {
    readonly id: string;
    readonly nombre: string;
    readonly estado: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly nombrePuntos: string;
    readonly requiereCheckIn: boolean;
    readonly zonaHoraria: string;
  };
  readonly retos: readonly EstadoRetoApp[];
  readonly premios: readonly {
    readonly id: string;
    readonly disponible: number;
    readonly pocos: boolean;
  }[];
  readonly ultimosMovimientos: readonly {
    readonly id: string;
    readonly tipo: string;
    readonly puntos: number;
    readonly detalle: string;
    readonly hora: string;
    readonly enStellar: boolean;
  }[];
}

export interface EstadoRetoApp {
  readonly id: string;
  readonly estado: EstadoRetoAsistente;
  readonly completadas: number;
  readonly desde: string | null;
  readonly completadoAt: string | null;
}

/** `GET /app/evento`: lo que casi no cambia (la base de HU-309). */
export interface EventoApp {
  readonly id: string;
  readonly nombre: string;
  readonly logoUrl: string | null;
  readonly retos: readonly DefinicionReto[];
  readonly premios: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly imagenUrl: string | null;
    readonly puntos: number;
    readonly maxPorPersona: number | null;
  }[];
  readonly agenda: readonly ActividadApp[];
}

export interface DefinicionReto {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly puntos: number;
  readonly tipo: string;
  readonly lugar: string | null;
  readonly disponibleDesde: string | null;
  readonly disponibleHasta: string | null;
}

export interface ActividadApp {
  readonly id: string;
  readonly titulo: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly lugar: string | null;
  readonly expositor: string | null;
  readonly retoId: string | null;
}

/** `GET /app/mi-entrada` (HU-311 §1). */
export interface MiEntrada {
  readonly qr: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly validoHasta: string;
  readonly grupos: readonly string[];
  readonly ci: { readonly cargado: boolean; readonly verificado: boolean };
}

/** Un movimiento del historial (HU-311 §2). */
export interface MovimientoHistorial {
  readonly id: string;
  readonly tipo: string;
  readonly puntos: number;
  readonly detalle: string;
  readonly hora: string;
  readonly estado: 'confirmado' | 'registrado_en_stellar';
  readonly enlaceStellar: string | null;
  readonly anulaMovimientoId: string | null;
}

export interface PaginaHistorial {
  readonly items: readonly MovimientoHistorial[];
  readonly pagination: { readonly limit: number; readonly nextCursor: string | null };
}

export interface DatosVincular {
  readonly tipo: TipoAcceso;
  readonly token: string;
  readonly llavePublica: LlavePublicaEc;
  readonly deviceId: string;
  readonly senales?: Readonly<Record<string, string | number | boolean | null>>;
  readonly terminos: { readonly version: string; readonly privacidad: string };
}

/** El API del asistente: ningún componente usa HttpClient directo (AGENTS.md). */
@Injectable({ providedIn: 'root' })
export class AsistenteApi {
  private readonly http = inject(HttpClient);

  describeAcceso(tipo: TipoAcceso, token: string): Promise<AccesoVisto> {
    return firstValueFrom(
      this.http.get<AccesoVisto>(
        `${BASE}/acceso/${encodeURIComponent(tipo)}/${encodeURIComponent(token)}`,
      ),
    );
  }

  vincular(datos: DatosVincular): Promise<EstadoApp> {
    return firstValueFrom(this.http.post<EstadoApp>(`${BASE}/acceso/vincular`, datos));
  }

  /** El navegador revalida solo con `If-None-Match` (`Cache-Control: no-cache`) y usa el 304. */
  getEstado(): Promise<EstadoApp> {
    return firstValueFrom(this.http.get<EstadoApp>(`${BASE}/app/estado`));
  }

  getMiEntrada(): Promise<MiEntrada> {
    return firstValueFrom(this.http.get<MiEntrada>(`${BASE}/app/mi-entrada`));
  }

  listMovimientos(cursor?: string): Promise<PaginaHistorial> {
    const consulta = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return firstValueFrom(this.http.get<PaginaHistorial>(`${BASE}/app/movimientos${consulta}`));
  }

  getEvento(): Promise<EventoApp> {
    return firstValueFrom(this.http.get<EventoApp>(`${BASE}/app/evento`));
  }
}
