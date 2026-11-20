import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Pagina<T> {
  readonly items: readonly T[];
  readonly pagination: { readonly nextCursor: string | null };
}

export interface OrganizacionFila {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly estado: 'activa' | 'suspendida';
  readonly esDemo: boolean;
  readonly eventos: Readonly<Record<string, number>>;
  readonly dueno: {
    readonly nombre: string | null;
    readonly email: string;
    readonly estado: string;
  } | null;
}

export interface OrganizacionDetalle {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly estado: 'activa' | 'suspendida';
  readonly esDemo: boolean;
  readonly duenos: readonly {
    readonly id: string;
    readonly estado: string;
    readonly nombre: string | null;
    readonly email: string;
    readonly aceptadoAt: string | null;
  }[];
  readonly eventos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly tipo: string;
    readonly estado: string;
    readonly inicioAt: string;
  }[];
}

export interface EventoFila {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly estado: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly contratoId: string | null;
  readonly intervaloAnclajeMin: number | null;
  readonly ultimoLoteConfirmadoAt: string | null;
  readonly organizacion: { readonly id: string; readonly nombre: string };
}

export interface CostoRed {
  readonly transacciones: number;
  readonly comisionStroops: string;
  readonly comisionXlm: string;
  readonly porOperacion: Readonly<
    Record<string, { cantidad: number; comisionStroops: string; comisionXlm: string }>
  >;
}

export interface PersonaFila {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
  readonly rolPlataforma: 'superadmin' | 'admin' | 'soporte' | null;
  readonly estado: string;
  readonly aceptado: boolean;
  readonly segundoFactor: boolean;
}

export interface FilaBitacora {
  readonly id: string;
  readonly cuando: string;
  readonly quien: { readonly nombre: string; readonly rol: string | null; readonly tipo: string };
  readonly accion: string;
  readonly texto: string;
  readonly objeto: { readonly tipo: string; readonly nombre: string | null } | null;
  readonly antes: Record<string, unknown> | null;
  readonly despues: Record<string, unknown> | null;
}

const BASE = '/api/v1/plataforma';

/** HU-410: un mensaje del formulario de contacto, en la lista. */
export interface ContactoFila {
  readonly id: string;
  readonly nombre: string;
  readonly organizacion: string | null;
  readonly tipoEvento: string | null;
  readonly asistentesAprox: string | null;
  readonly estado: 'nuevo' | 'respondido' | 'descartado';
  readonly createdAt: string;
}

export interface ContactoDetalle extends ContactoFila {
  readonly email: string;
  readonly mensaje: string;
  readonly notaInterna: string | null;
  readonly atendidoAt: string | null;
  readonly borrarAt: string;
}

function toParams(valores: Readonly<Record<string, string | null | undefined>>): HttpParams {
  let params = new HttpParams();
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) {
      params = params.set(clave, valor);
    }
  }
  return params;
}

/** `/plataforma` del API (HU-202). */
@Injectable({ providedIn: 'root' })
export class PlataformaApi {
  private readonly http = inject(HttpClient);

  listOrganizaciones(filtros: { q?: string; cursor?: string | null }) {
    return firstValueFrom(
      this.http.get<Pagina<OrganizacionFila>>(`${BASE}/organizaciones`, {
        params: toParams(filtros),
      }),
    );
  }

  getOrganizacion(id: string) {
    return firstValueFrom(this.http.get<OrganizacionDetalle>(`${BASE}/organizaciones/${id}`));
  }

  createOrganizacion(datos: { nombre: string; duenoEmail: string; duenoNombre: string }) {
    return firstValueFrom(this.http.post<{ id: string }>(`${BASE}/organizaciones`, datos));
  }

  updateOrganizacion(id: string, datos: { estado?: 'activa' | 'suspendida'; motivo?: string }) {
    return firstValueFrom(this.http.patch<void>(`${BASE}/organizaciones/${id}`, datos));
  }

  inviteDueno(id: string, datos: { email: string; nombre: string; motivo: string }) {
    return firstValueFrom(this.http.post<void>(`${BASE}/organizaciones/${id}/dueno`, datos));
  }

  createEventoPrueba(id: string, datos: { nombre: string; inicioAt: string; finAt: string }) {
    return firstValueFrom(
      this.http.post<{ id: string }>(`${BASE}/organizaciones/${id}/eventos-prueba`, datos),
    );
  }

  listContactos(filtros: { estado?: string | null; cursor?: string | null }) {
    return firstValueFrom(
      this.http.get<Pagina<ContactoFila> & { nuevos: number }>(`${BASE}/contactos`, {
        params: toParams(filtros),
      }),
    );
  }

  getContacto(id: string) {
    return firstValueFrom(this.http.get<ContactoDetalle>(`${BASE}/contactos/${id}`));
  }

  updateContacto(
    id: string,
    cambios: { estado?: ContactoFila['estado']; notaInterna?: string | null },
  ) {
    return firstValueFrom(this.http.patch<void>(`${BASE}/contactos/${id}`, cambios));
  }

  listEventos(filtros: { cursor?: string | null; organizacionId?: string }) {
    return firstValueFrom(
      this.http.get<Pagina<EventoFila>>(`${BASE}/eventos`, { params: toParams(filtros) }),
    );
  }

  /** HU-324: el ZIP de las fotos autorizadas; el enlace sale de `getOperacion`. */
  createDescargaFotos(eventoId: string) {
    return firstValueFrom(
      this.http.post<{ operacionId: string }>(`${BASE}/eventos/${eventoId}/fotos/descargas`, {}),
    );
  }

  getOperacion(eventoId: string, id: string) {
    return firstValueFrom(
      this.http.get<{
        readonly estado: 'en_cola' | 'procesando' | 'lista' | 'fallida' | 'confirmada';
        readonly error: string | null;
        readonly descarga: { readonly url: string } | null;
      }>(`${BASE}/eventos/${eventoId}/operaciones/${id}`),
    );
  }

  updateIntervalo(id: string, intervaloAnclajeMin: number | null, motivo: string) {
    return firstValueFrom(
      this.http.patch<void>(`${BASE}/eventos/${id}`, { intervaloAnclajeMin, motivo }),
    );
  }

  getCostoRed(filtros: { mes?: string; eventoId?: string }) {
    return firstValueFrom(
      this.http.get<CostoRed>(`${BASE}/costo-red`, { params: toParams(filtros) }),
    );
  }

  listPersonas(email?: string) {
    return firstValueFrom(
      this.http.get<Pagina<PersonaFila>>(`${BASE}/usuarios`, { params: toParams({ email }) }),
    );
  }

  invitePersona(datos: { email: string; nombre: string; rol: 'admin' | 'soporte' }) {
    return firstValueFrom(this.http.post<{ id: string }>(`${BASE}/usuarios`, datos));
  }

  updateRol(id: string, rol: 'admin' | 'soporte' | null, motivo: string) {
    return firstValueFrom(this.http.patch<void>(`${BASE}/usuarios/${id}`, { rol, motivo }));
  }

  resetSegundoFactor(id: string, motivo: string, verificacion: string) {
    return firstValueFrom(
      this.http.post<void>(`${BASE}/usuarios/${id}/segundo-factor/restablecer`, {
        motivo,
        verificacion,
      }),
    );
  }

  listBitacora(cursor?: string | null) {
    return firstValueFrom(
      this.http.get<Pagina<FilaBitacora>>(`${BASE}/bitacora`, { params: toParams({ cursor }) }),
    );
  }
}
