/** Tipos de evento (D52): solo los `real` salen en *Eventos*, reportes públicos y métricas. */
export const TIPOS_EVENTO = ['real', 'demo', 'prueba'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Los únicos tipos que se listan públicamente y cuentan en las métricas. */
export const TIPOS_PUBLICABLES = ['real'] as const satisfies readonly TipoEvento[];

export function isTipoPublicable(tipo: TipoEvento): boolean {
  return (TIPOS_PUBLICABLES as readonly TipoEvento[]).includes(tipo);
}

/** Estados del evento (Modelo de datos §11.1). */
export const ESTADOS_EVENTO = [
  'borrador',
  'publicado',
  'en_curso',
  'pausado',
  'cerrado',
  'archivado',
] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

/** Visibilidad (D37): privado por defecto. */
export const VISIBILIDADES_EVENTO = ['privado', 'solo_enlace', 'publico'] as const;
export type VisibilidadEvento = (typeof VISIBILIDADES_EVENTO)[number];
export const VISIBILIDAD_POR_DEFECTO: VisibilidadEvento = 'privado';

export const ZONA_HORARIA_POR_DEFECTO = 'America/La_Paz';
