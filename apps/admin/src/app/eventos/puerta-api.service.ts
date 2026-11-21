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
  readonly registrosPorRegistrador: readonly { readonly nombre: string; readonly total: number }[];
}

/** La ficha de la puerta (PU2). Sin IP ni huella: solo el modelo del celular. */
export interface FichaPuerta {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly email: string | null;
  /** HU-411: completo para D y C; el registrador lo recibe oculto (`•••• 4567`). */
  readonly celular: string | null;
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

/** HU-305: un aviso *No fui yo* en la puerta. */
export interface AlertaPuerta {
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
  readonly queNoReconoce: string | null;
  readonly desde: string | null;
  readonly atendidaPor: string | null;
  readonly resolucion: string | null;
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

  /** HU-303: la misma clave en el reintento ("Es otra persona") es el mismo intento. */
  registerNuevo(
    eventoId: string,
    datos: { nombre: string; email?: string; celular?: string; confirmarDuplicado?: boolean },
    clave: string,
  ): Promise<FichaPuerta> {
    return firstValueFrom(
      this.http.post<FichaPuerta>(
        `${BASE}/eventos/${eventoId}/puerta/registros`,
        datos,
        conClave(clave),
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

  async listAlertas(eventoId: string): Promise<readonly AlertaPuerta[]> {
    const params = new HttpParams().set('tipo', 'no_fui_yo');
    const pagina = await firstValueFrom(
      this.http.get<{ items: AlertaPuerta[] }>(`${BASE}/eventos/${eventoId}/alertas`, { params }),
    );
    return pagina.items;
  }

  attendAlerta(id: string): Promise<{ id: string; estado: string; asistenteId: string | null }> {
    return firstValueFrom(
      this.http.post<{ id: string; estado: string; asistenteId: string | null }>(
        `${BASE}/alertas/${id}/atender`,
        {},
      ),
    );
  }

  resolveAlerta(
    id: string,
    datos: { resolucion: 'revincular' | 'descartar' | 'derivar'; nota?: string },
  ): Promise<{ id: string; estado: string }> {
    return firstValueFrom(
      this.http.post<{ id: string; estado: string }>(`${BASE}/alertas/${id}/resolver`, datos),
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
