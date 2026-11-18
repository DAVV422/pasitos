import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { TipoAcceso } from '@pasitos/dominio';
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

/** `GET /app/estado` (HU-306; HU-308 lo completa). */
export interface EstadoApp {
  readonly asistente: { readonly codigo: string; readonly nombre: string; readonly estado: string };
  readonly saldo: number;
  readonly evento: {
    readonly id: string;
    readonly nombre: string;
    readonly estado: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly nombrePuntos: string;
    readonly requiereCheckIn: boolean;
  };
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

  getEstado(): Promise<EstadoApp> {
    return firstValueFrom(this.http.get<EstadoApp>(`${BASE}/app/estado`));
  }
}
