import { RenderMode, ServerRoute } from '@angular/ssr';

/** Las páginas fijas se prerenderizan; cualquier otra dirección responde 404 de verdad (HU-404). */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'terminos', renderMode: RenderMode.Prerender },
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
