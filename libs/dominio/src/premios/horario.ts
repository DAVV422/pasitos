/** El horario de un premio (HU-413). Sin Zod: lo usan también las apps del evento. */

/** HU-413: si el premio se puede canjear ahora, o si todavía no o ya no. */
export type HorarioPremio = 'disponible' | 'todavia_no' | 'ya_no';

export function getHorarioPremio(
  premio: {
    readonly disponibleDesde: Date | string | null;
    readonly disponibleHasta: Date | string | null;
  },
  ahora: Date,
): HorarioPremio {
  const desde = premio.disponibleDesde ? new Date(premio.disponibleDesde) : null;
  const hasta = premio.disponibleHasta ? new Date(premio.disponibleHasta) : null;
  if (desde && ahora < desde) return 'todavia_no';
  if (hasta && ahora >= hasta) return 'ya_no';
  return 'disponible';
}

/** HU-413: *"Desde las 15:00"* o *"Ya no está disponible"*, en la hora del evento. */
export function describeHorarioPremio(
  premio: {
    readonly disponibleDesde: Date | string | null;
    readonly disponibleHasta: Date | string | null;
  },
  ahora: Date,
  zonaHoraria: string,
): string | null {
  const horario = getHorarioPremio(premio, ahora);
  if (horario === 'disponible') return null;
  if (horario === 'ya_no' || !premio.disponibleDesde) return 'Ya no está disponible';
  const hora = new Intl.DateTimeFormat('es-BO', {
    timeZone: zonaHoraria,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(premio.disponibleDesde));
  return `Desde las ${hora}`;
}
