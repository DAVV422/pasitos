import { InjectionToken } from '@angular/core';

/** La página pública de un evento (`GET /publico/eventos/:slug`, HU-406). */
export interface EventoPagina {
  readonly slug: string;
  readonly nombre: string;
  readonly organizacion: string;
  readonly visibilidad: 'publico' | 'solo_enlace';
  readonly estado: 'proximo' | 'en_curso' | 'terminado';
  /** El camino del reporte compartido (`/reporte/<token>`), si el evento terminó y se comparte. */
  readonly reporte: string | null;
  readonly logo: string | null;
  readonly portada: string | null;
  readonly zonaHoraria: string;
  readonly comoEntrar: { readonly registroPuerta: boolean; readonly qrRegistro: boolean };
  readonly descripcion: string | null;
  readonly fecha: { readonly inicioAt: string; readonly finAt: string } | null;
  readonly lugar: {
    readonly nombre: string | null;
    readonly direccion: string | null;
    readonly mapa: string | null;
    readonly enlaceMapa: string | null;
  } | null;
  readonly agenda: readonly {
    readonly titulo: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly lugar: string | null;
    readonly expositor: string | null;
  }[];
  readonly sponsors: readonly {
    readonly nombre: string;
    readonly logo: string | null;
    readonly descripcion: string | null;
    readonly enlace: string | null;
  }[];
  readonly preguntas: readonly { readonly pregunta: string; readonly respuesta: string }[];
  readonly retos: readonly {
    readonly nombre: string;
    readonly descripcion: string | null;
    readonly puntos: number;
  }[];
  readonly catalogo: readonly {
    readonly nombre: string;
    readonly imagen: string | null;
    readonly puntos: number;
    readonly estado: 'agotado' | 'pocos' | 'disponible';
  }[];
  readonly contacto: string | null;
}

/** `null`: el evento no tiene página pública (`404`). */
export type BuscarEvento = (slug: string) => Promise<EventoPagina | null>;

/**
 * De dónde sale el evento: en el servidor, el API por la red interna (`app.config.server.ts`); en
 * el navegador, del estado transferido o, si no está, del API del mismo dominio.
 */
export const FUENTE_EVENTO = new InjectionToken<BuscarEvento>('FUENTE_EVENTO', {
  factory: () => (slug) => fetchEvento('', slug),
});

export async function fetchEvento(base: string, slug: string): Promise<EventoPagina | null> {
  const respuesta = await fetch(`${base}/api/v1/publico/eventos/${encodeURIComponent(slug)}`);
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(`GET /publico/eventos/${slug}: ${respuesta.status}`);
  return (await respuesta.json()) as EventoPagina;
}
