import { InjectionToken } from '@angular/core';

export type MomentoEvento = 'proximos' | 'en_curso' | 'pasados';

/** Un evento en la sección *Eventos* (`GET /publico/eventos`, HU-405). */
export interface EventoPublico {
  readonly slug: string;
  readonly nombre: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly zonaHoraria: string;
  readonly lugar: string | null;
  readonly organizacion: string;
  readonly imagen: string | null;
  readonly estado: 'proximo' | 'en_curso' | 'terminado';
}

export interface PaginaEventos {
  readonly items: readonly EventoPublico[];
  readonly pagination: { readonly nextCursor: string | null };
}

export type BuscarEventos = (
  momento: MomentoEvento,
  cursor: string | null,
) => Promise<PaginaEventos>;

/**
 * De dónde salen los eventos. En el servidor (SSR) se piden al API por la red interna
 * (`app.config.server.ts`); el navegador los recibe en el estado transferido. Si el navegador no los
 * tiene (por ejemplo, el estado se perdió), los pide al API del mismo dominio.
 */
export const FUENTE_EVENTOS = new InjectionToken<BuscarEventos>('FUENTE_EVENTOS', {
  factory: () => (momento, cursor) => fetchEventos('', momento, cursor),
});

export async function fetchEventos(
  base: string,
  momento: MomentoEvento,
  cursor: string | null,
): Promise<PaginaEventos> {
  const parametros = new URLSearchParams({ momento, limit: '12' });
  if (cursor) parametros.set('cursor', cursor);
  const respuesta = await fetch(`${base}/api/v1/publico/eventos?${parametros.toString()}`);
  if (!respuesta.ok) throw new Error(`GET /publico/eventos: ${respuesta.status}`);
  return (await respuesta.json()) as PaginaEventos;
}
