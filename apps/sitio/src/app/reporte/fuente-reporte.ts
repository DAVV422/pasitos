import { InjectionToken } from '@angular/core';
import type { Reporte } from '@pasitos/dominio';

/** `null`: el enlace no existe o se dejó de compartir (`404`). */
export type BuscarReporte = (token: string) => Promise<Reporte | null>;

/**
 * De dónde sale el reporte compartido (HU-402 §5): en el servidor, el API por la red interna
 * (`app.config.server.ts`); en el navegador, del estado transferido o del API del mismo dominio.
 */
export const FUENTE_REPORTE = new InjectionToken<BuscarReporte>('FUENTE_REPORTE', {
  factory: () => (token) => fetchReporte('', token),
});

export async function fetchReporte(base: string, token: string): Promise<Reporte | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const respuesta = await fetch(`${base}/api/v1/publico/reportes/${token}`);
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(`GET /publico/reportes: ${respuesta.status}`);
  return (await respuesta.json()) as Reporte;
}
