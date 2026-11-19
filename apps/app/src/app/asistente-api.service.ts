import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { EstadoRetoAsistente, TipoAcceso } from '@pasitos/dominio';
import type { LlavePublicaEc } from '@pasitos/firmas';
import { CLAVE_IDEMPOTENCIA, FIRMAR } from '@pasitos/web-core';
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
  /** HU-322: la última foto en un reto con foto y los intentos que le quedan. */
  readonly foto?: {
    readonly estado: string;
    readonly motivo: string | null;
    readonly intentosRestantes: number;
  } | null;
}

/** `GET /app/evento`: lo que casi no cambia (la base de HU-309). */
export interface EventoApp {
  readonly id: string;
  readonly nombre: string;
  readonly logoUrl: string | null;
  readonly info: InfoEvento;
  readonly lugares: readonly LugarApp[];
  readonly sponsors: readonly SponsorApp[];
  readonly preguntas: readonly { readonly pregunta: string; readonly respuesta: string }[];
  readonly retos: readonly DefinicionReto[];
  readonly premios: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly imagenUrl: string | null;
    readonly puntos: number;
    readonly maxPorPersona: number | null;
    /** HU-325: solo para un grupo (*VIP*). */
    readonly grupo: GrupoApp | null;
    /** HU-321: *"Lleva tu carnet"*. */
    readonly requiereCi: boolean;
  }[];
  readonly agenda: readonly ActividadApp[];
}

/** HU-325: el grupo de un reto o premio exclusivo. */
export interface GrupoApp {
  readonly nombre: string;
  readonly color: string;
}

/** Lo de la pantalla *Información* (HU-309). El wifi va solo a la app del asistente. */
export interface InfoEvento {
  readonly descripcion: string | null;
  readonly contacto: string | null;
  readonly wifi: string | null;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly lugarNombre: string | null;
  readonly lugarDireccion: string | null;
  readonly portadaUrl: string | null;
  /** El plano en 1200 px. */
  readonly planoUrl: string | null;
  readonly nombrePuntos: string;
}

export interface LugarApp {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly numeroMapa: number | null;
  readonly descripcion: string | null;
}

export interface SponsorApp {
  readonly id: string;
  readonly nombre: string;
  /** El logo en 400 px. */
  readonly logoUrl: string | null;
  readonly descripcion: string | null;
  readonly enlace: string | null;
  readonly lugar: string | null;
}

export interface DefinicionReto {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly puntos: number;
  readonly tipo: string;
  readonly lugar: string | null;
  readonly lugarId: string | null;
  readonly sponsorId: string | null;
  /** HU-325: solo para un grupo (*VIP*). */
  readonly grupo: GrupoApp | null;
  /** HU-322: en los retos con foto. */
  readonly instruccionFoto: string | null;
  readonly permiteGaleria: boolean;
  readonly autorizacionUso: string;
  readonly intentosMax: number;
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

/** `GET /app/dispositivo` (HU-312 §1): sin IP ni huella. */
export interface DispositivoApp {
  readonly actual: {
    readonly modelo: string;
    readonly desde: string;
    readonly metodo: string;
    readonly puesto: string;
  } | null;
  readonly historial: readonly {
    readonly modelo: string;
    readonly desde: string;
    readonly anuladaAt: string;
    readonly motivo: string | null;
    readonly por: string;
  }[];
  readonly intentos: readonly {
    readonly modelo: string;
    readonly at: string;
    readonly que: string;
  }[];
  readonly avisos: readonly { readonly id: string; readonly estado: string; readonly at: string }[];
}

/** `POST /app/reclamos` (HU-310): lo ganado y el saldo que confirma el servidor. */
export interface ReclamoAceptado {
  readonly movimientoId: string;
  readonly reto: { readonly id: string; readonly nombre: string };
  readonly puntos: number;
  readonly saldo: number;
}

/** HU-313: el cobro de la mesa, antes de pagarlo. */
export interface ItemCobro {
  readonly premioId: string;
  readonly nombre: string;
  readonly cantidad: number;
  readonly puntos: number;
}

export interface VistaCobro {
  readonly id: string;
  readonly mesa: string;
  readonly items: readonly ItemCobro[];
  readonly total: number;
  readonly saldo: number;
  readonly saldoDespues: number;
  readonly expiraAt: string;
  readonly estado: 'pendiente';
  readonly requiereCi: boolean;
}

export interface CanjeConfirmado {
  readonly comprobante: string;
  readonly items: readonly ItemCobro[];
  readonly total: number;
  readonly saldo: number;
}

export interface DatosVincular {
  readonly tipo: TipoAcceso;
  readonly token: string;
  readonly llavePublica: LlavePublicaEc;
  readonly deviceId: string;
  readonly senales?: Readonly<Record<string, string | number | boolean | null>>;
  readonly terminos: { readonly version: string; readonly privacidad: string };
}

/** Lo que ve la persona al abrir un QR de registro (HU-319 §4). */
export interface RegistroVisto {
  readonly evento: { readonly nombre: string; readonly logoUrl: string | null };
  readonly qr: { readonly nombre: string };
  readonly terminos: { readonly version: string; readonly privacidad: string };
  readonly permisoHasta: string;
  /** HU-321: si el evento pide el carnet (opcional). */
  readonly pideCarnet: boolean;
}

/** Lo que manda el formulario del autorregistro (HU-320 §2). */
export interface DatosRegistro {
  readonly nombre: string;
  readonly email: string | null;
  readonly ci: string | null;
  readonly deviceId: string;
  readonly llavePublica: LlavePublicaEc;
  readonly senales?: Record<string, string | number | boolean | null>;
  readonly terminos: { readonly version: string; readonly privacidad: string };
}

/** *Mis datos* (HU-320 §4). */
/** Una foto de la persona (HU-324). */
export interface MiFoto {
  readonly id: string;
  readonly reto: string;
  readonly estado: string;
  readonly motivo: string | null;
  readonly autorizaUso: boolean;
  readonly miniatura: string | null;
  readonly enviadaAt: string;
}

export interface MisDatos {
  readonly nombre: string;
  readonly email: string | null;
  readonly ci: string | null;
  readonly ciVerificado: boolean;
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

  /** HU-319: abrir el QR de registro (deja el permiso en la cookie `px_registro`). */
  openRegistro(tipo: string, codigo: string): Promise<RegistroVisto> {
    return firstValueFrom(
      this.http.get<RegistroVisto>(
        `${BASE}/app/registro/${encodeURIComponent(tipo)}/${encodeURIComponent(codigo)}`,
      ),
    );
  }

  /** HU-320: crear la cuenta. La misma clave en los reintentos. */
  register(datos: DatosRegistro, clave: string): Promise<EstadoApp & { yaRegistrado: boolean }> {
    return firstValueFrom(
      this.http.post<EstadoApp & { yaRegistrado: boolean }>(`${BASE}/app/registro`, datos, {
        headers: new HttpHeaders({ 'Idempotency-Key': clave }),
      }),
    );
  }

  /** *Mis fotos* (HU-324). */
  listMisFotos(): Promise<{ readonly items: readonly MiFoto[] }> {
    return firstValueFrom(
      this.http.get<{ readonly items: readonly MiFoto[] }>(`${BASE}/app/fotos`),
    );
  }

  /** Firmado: la foto sale de las descargas siguientes; los puntos no cambian. */
  withdrawAutorizacionFoto(id: string): Promise<{ readonly autorizaUso: false }> {
    return firstValueFrom(
      this.http.post<{ readonly autorizaUso: false }>(
        `${BASE}/app/fotos/${id}/retirar-autorizacion`,
        {},
        { context: new HttpContext().set(FIRMAR, true) },
      ),
    );
  }

  getMisDatos(): Promise<MisDatos> {
    return firstValueFrom(this.http.get<MisDatos>(`${BASE}/app/yo`));
  }

  updateMisDatos(cambios: Partial<Pick<MisDatos, 'nombre' | 'email' | 'ci'>>): Promise<MisDatos> {
    return firstValueFrom(
      this.http.patch<MisDatos>(`${BASE}/app/yo`, cambios, {
        context: new HttpContext().set(FIRMAR, true),
      }),
    );
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

  /** Firmado e idempotente: los reintentos usan la misma clave. */
  claim(qr: string, clave: string): Promise<ReclamoAceptado> {
    return firstValueFrom(
      this.http.post<ReclamoAceptado>(
        `${BASE}/app/reclamos`,
        { qr },
        { context: new HttpContext().set(FIRMAR, true).set(CLAVE_IDEMPOTENCIA, clave) },
      ),
    );
  }

  getCobro(token: string): Promise<VistaCobro> {
    return firstValueFrom(
      this.http.get<VistaCobro>(`${BASE}/app/cobros/${encodeURIComponent(token)}`),
    );
  }

  /** Firmado e idempotente: un doble toque cobra una sola vez (V8). */
  confirmCobro(token: string, clave: string): Promise<CanjeConfirmado> {
    return firstValueFrom(
      this.http.post<CanjeConfirmado>(
        `${BASE}/app/cobros/${encodeURIComponent(token)}/confirmar`,
        null,
        { context: new HttpContext().set(FIRMAR, true).set(CLAVE_IDEMPOTENCIA, clave) },
      ),
    );
  }

  getDispositivo(): Promise<DispositivoApp> {
    return firstValueFrom(this.http.get<DispositivoApp>(`${BASE}/app/dispositivo`));
  }

  /** Firmado con la llave del navegador e idempotente (HU-312 §3). */
  noFuiYo(
    datos: { readonly sobre: 'dispositivo' | 'intento' | 'canje'; readonly refId?: string },
    clave: string,
  ): Promise<{ alertaId: string; estado: string; yaExistia: boolean; mensaje: string }> {
    return firstValueFrom(
      this.http.post<{ alertaId: string; estado: string; yaExistia: boolean; mensaje: string }>(
        `${BASE}/app/no-fui-yo`,
        datos,
        { context: new HttpContext().set(FIRMAR, true).set(CLAVE_IDEMPOTENCIA, clave) },
      ),
    );
  }

  getEvento(): Promise<EventoApp> {
    return firstValueFrom(this.http.get<EventoApp>(`${BASE}/app/evento`));
  }
}
