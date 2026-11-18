import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { MotivoRevincular } from '@pasitos/dominio';
import { firstValueFrom } from 'rxjs';

const BASE = '/api/v1';

/** `GET /eventos/:id/puerta` (HU-301 §2). */
export interface ResumenPuerta {
  readonly presentes: number;
  readonly total: number;
  readonly registrosRestantes: number | null;
  readonly avisosNoFuiYo: number;
}

/** La ficha de la puerta (PU2). Sin IP ni huella: solo el modelo del celular. */
export interface FichaPuerta {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly estado: 'invitado' | 'registrado' | 'presente' | 'cancelado';
  readonly saldo: number;
  readonly dispositivo: {
    readonly modelo: string;
    readonly desde: string;
    readonly metodo: string;
  } | null;
  readonly historial: readonly {
    readonly modelo: string;
    readonly metodo: string;
    readonly desde: string;
    readonly anuladaAt: string;
    readonly motivo: string | null;
  }[];
  readonly checkIn: { readonly at: string; readonly por: string | null } | null;
  readonly grupos: readonly string[];
  readonly carnet: null;
}

export interface ResultadoBusqueda {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly estado: string;
}

/** HU-302: el QR de asistente y su enlace corto. */
export interface AccesoGenerado {
  readonly id: string;
  readonly qr: string;
  readonly enlaceCorto: string;
  readonly codigoCorto: string;
  readonly expiraAt: string;
}

export interface EstadoAcceso {
  readonly estado: 'pendiente' | 'vinculado' | 'vencido';
  readonly modelo: string | null;
  readonly vinculadoAt: string | null;
}

export interface TarjetaImpresa {
  readonly nombre: string;
  readonly codigo: string;
  readonly evento: string;
  readonly qr: string;
}

/** Lo que mueve puntos va con `Idempotency-Key`: un doble toque no da dos bienvenidas. */
function conClave(clave: string = crypto.randomUUID()): { headers: HttpHeaders } {
  return { headers: new HttpHeaders({ 'Idempotency-Key': clave }) };
}

/** El API de la vista Puerta (HU-301, HU-302). */
@Injectable({ providedIn: 'root' })
export class PuertaApi {
  private readonly http = inject(HttpClient);

  getResumen(eventoId: string): Promise<ResumenPuerta> {
    return firstValueFrom(this.http.get<ResumenPuerta>(`${BASE}/eventos/${eventoId}/puerta`));
  }

  async search(eventoId: string, q: string): Promise<readonly ResultadoBusqueda[]> {
    const params = new HttpParams().set('q', q).set('limit', 20);
    const pagina = await firstValueFrom(
      this.http.get<{ items: ResultadoBusqueda[] }>(`${BASE}/eventos/${eventoId}/asistentes`, {
        params,
      }),
    );
    return pagina.items;
  }

  scanEntrada(eventoId: string, qr: string): Promise<FichaPuerta> {
    return firstValueFrom(
      this.http.post<FichaPuerta>(`${BASE}/eventos/${eventoId}/puerta/escanear-entrada`, { qr }),
    );
  }

  getFicha(asistenteId: string): Promise<FichaPuerta> {
    return firstValueFrom(this.http.get<FichaPuerta>(`${BASE}/asistentes/${asistenteId}/ficha`));
  }

  register(asistenteId: string, metodo: 'escaneo_entrada' | 'busqueda'): Promise<FichaPuerta> {
    return firstValueFrom(
      this.http.post<FichaPuerta>(
        `${BASE}/asistentes/${asistenteId}/check-in`,
        { metodo },
        conClave(),
      ),
    );
  }

  createAcceso(asistenteId: string, motivo?: MotivoRevincular): Promise<AccesoGenerado> {
    return firstValueFrom(
      this.http.post<AccesoGenerado>(
        `${BASE}/asistentes/${asistenteId}/accesos`,
        motivo ? { motivo } : {},
      ),
    );
  }

  getAcceso(id: string): Promise<EstadoAcceso> {
    return firstValueFrom(this.http.get<EstadoAcceso>(`${BASE}/accesos/${id}`));
  }

  getTarjeta(asistenteId: string): Promise<TarjetaImpresa> {
    return firstValueFrom(
      this.http.get<TarjetaImpresa>(`${BASE}/asistentes/${asistenteId}/tarjeta`),
    );
  }

  undo(asistenteId: string, motivo: string): Promise<FichaPuerta> {
    return firstValueFrom(
      this.http.post<FichaPuerta>(
        `${BASE}/asistentes/${asistenteId}/check-in/anular`,
        { motivo },
        conClave(),
      ),
    );
  }
}
