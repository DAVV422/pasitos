import type { DefinicionReto, EstadoApp, EstadoRetoApp, EventoApp } from './asistente-api.service';

/** Un reto como lo ve la persona: su definición (`/app/evento`) y su estado (`/app/estado`). */
export interface RetoVista extends DefinicionReto {
  readonly estadoPersona: EstadoRetoApp;
}

/**
 * Los retos visibles con su estado, en el orden del evento. Solo los que vienen en el estado: el
 * servidor ya filtra los de otros grupos (HU-325).
 */
export function getRetosVista(estado: EstadoApp | null, evento: EventoApp | null): RetoVista[] {
  if (!estado || !evento) return [];
  const porId = new Map(estado.retos.map((reto) => [reto.id, reto]));
  return evento.retos.flatMap((definicion) => {
    const estadoPersona = porId.get(definicion.id);
    return estadoPersona ? [{ ...definicion, estadoPersona }] : [];
  });
}

/** Los grupos de la pantalla *Retos* (mockup A2). */
export function groupRetos(retos: readonly RetoVista[]) {
  return {
    porHacer: retos.filter((r) => r.estadoPersona.estado === 'disponible'),
    masTarde: retos.filter((r) => r.estadoPersona.estado === 'desde'),
    completados: retos.filter((r) => r.estadoPersona.estado === 'completado'),
    cerrados: retos.filter(
      (r) => r.estadoPersona.estado === 'agotado' || r.estadoPersona.estado === 'desactivado',
    ),
  };
}

/** Cómo se completa, en una frase (*"Escanea el QR en Sala A"*). */
export function getComoSeCompleta(reto: DefinicionReto): string {
  if (reto.tipo === 'qr') {
    return reto.lugar ? `Escanea el QR en ${reto.lugar}` : 'Escanea el QR del reto';
  }
  if (reto.tipo === 'encuesta') return 'Encuesta en la app';
  // HU-322.
  if (reto.tipo === 'foto') return reto.instruccionFoto ?? 'Saca una foto';
  // HU-321.
  if (reto.tipo === 'verificacion_ci') {
    return 'Pasa por la puerta o el stand de Pasitos con tu carnet';
  }
  return reto.lugar ? `Te lo dan en ${reto.lugar}` : 'Te lo da el equipo del evento';
}
