/** Fechas y horas en la zona del evento (no en la del celular). */
export function formatHora(fecha: string | Date, zona: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zona,
  }).format(new Date(fecha));
}

/** *"sábado 21 de noviembre a las 09:00"*. */
export function formatDiaYHora(fecha: string | Date, zona: string): string {
  const dia = new Intl.DateTimeFormat('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zona,
  }).format(new Date(fecha));
  return `${dia} a las ${formatHora(fecha, zona)}`;
}

/** *"2 días y 4 h"*, *"3 h y 20 min"*, *"12 min"*. */
export function formatFalta(ms: number): string {
  const minutos = Math.max(0, Math.ceil(ms / 60_000));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const resto = minutos % 60;
  if (dias > 0) return `${dias} ${dias === 1 ? 'día' : 'días'}${horas > 0 ? ` y ${horas} h` : ''}`;
  if (horas > 0) return `${horas} h${resto > 0 ? ` y ${resto} min` : ''}`;
  return `${resto} min`;
}

/** *"hace 3 min"*, para la copia sin conexión. */
export function formatHace(desde: number, ahora: number = Date.now()): string {
  const minutos = Math.floor((ahora - desde) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${horas} h`;
}
