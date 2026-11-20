import { RenderMode, ServerRoute } from '@angular/ssr';

/** Las páginas fijas se prerenderizan; cualquier otra dirección responde 404 de verdad (HU-404). */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'terminos', renderMode: RenderMode.Prerender },
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  // HU-405: se arma en cada pedido con los datos del API; Cloudflare la guarda un minuto.
  {
    path: 'eventos',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  },
  // HU-406: la página de cada evento; sin página pública responde 404 (lo decide la página).
  {
    path: 'eventos/:slug',
    renderMode: RenderMode.Server,
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
