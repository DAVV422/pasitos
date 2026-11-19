/**
 * Los grupos del evento (HU-325, D62): por ejemplo, *VIP*. Dan retos y premios exclusivos, incluso
 * souvenirs de 0 puntos, sin otra moneda. El color es una variante de los chips de `libs/ui`.
 */
export const COLORES_GRUPO = ['puntos', 'ok', 'peligro', 'atenuado'] as const;
export type ColorGrupo = (typeof COLORES_GRUPO)[number];

export const NOMBRES_COLOR_GRUPO: Readonly<Record<ColorGrupo, string>> = {
  puntos: 'Ámbar',
  ok: 'Verde',
  peligro: 'Rojo',
  atenuado: 'Gris',
};

/** Un reto o premio sin grupo lo ve todo el evento; con grupo, solo quien está en él. */
export function isParaLaPersona(
  grupoId: string | null,
  gruposDeLaPersona: readonly string[],
): boolean {
  return grupoId === null || gruposDeLaPersona.includes(grupoId);
}
