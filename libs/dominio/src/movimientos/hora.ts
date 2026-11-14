/** `2026-11-21T14:02:15.123Z` → `2026-11-21T14:02:15Z` (UTC, truncada al segundo). */
export function formatHoraPublica(fecha: Date): string {
  return `${fecha.toISOString().slice(0, 19)}Z`;
}
