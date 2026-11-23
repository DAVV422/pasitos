/**
 * El plano del evento (HU-414): cuándo dos lugares quedan muy juntos. Las posiciones van de 0 a 1
 * del ancho y del alto del plano; la distancia se mide en anchos del plano (con la proporción de la
 * imagen, para que arriba-abajo cuente igual que a los lados). Sin Zod: lo usan las apps del evento.
 */

/** Los zooms del plano en la app. */
export const ZOOMS_MAPA = [1, 2, 3, 4] as const;
const ZOOM_MAXIMO = 4;

/** Un número del plano en la app mide unos 36 px; un celular muestra el plano a unos 340 px. */
const TAMANO_MARCADOR_PX = 36;
const ANCHO_PLANO_CELULAR_PX = 340;

/** Más cerca que esto, los números se enciman en el celular incluso con el zoom más grande. */
export const DISTANCIA_ENCIMADOS = TAMANO_MARCADOR_PX / (ANCHO_PLANO_CELULAR_PX * ZOOM_MAXIMO);

/** Más cerca que esto, en la ficha de un lugar se ofrecen los de al lado (*Muy cerca*). */
export const DISTANCIA_CERCANOS = TAMANO_MARCADOR_PX / ANCHO_PLANO_CELULAR_PX;

export interface PuntoPlano {
  readonly id: string;
  readonly mapaX: number | null;
  readonly mapaY: number | null;
}

/** La distancia entre dos puntos del plano, en anchos del plano. `proporcion` = alto / ancho. */
export function getDistanciaPlano(
  a: { readonly mapaX: number; readonly mapaY: number },
  b: { readonly mapaX: number; readonly mapaY: number },
  proporcion: number,
): number {
  return Math.hypot(a.mapaX - b.mapaX, (a.mapaY - b.mapaY) * proporcion);
}

/**
 * Para cada lugar marcado, los otros marcados a menos de `distancia`, del más cercano al más lejano.
 * Los que no tienen vecinos no aparecen.
 */
export function findLugaresCercanos<T extends PuntoPlano>(
  lugares: readonly T[],
  distancia: number,
  proporcion: number,
): ReadonlyMap<string, readonly T[]> {
  const marcados = lugares.filter(
    (l): l is T & { mapaX: number; mapaY: number } => l.mapaX !== null && l.mapaY !== null,
  );
  const resultado = new Map<string, T[]>();
  for (const lugar of marcados) {
    const vecinos = marcados
      .filter((otro) => otro.id !== lugar.id)
      .map((otro) => ({ otro, d: getDistanciaPlano(lugar, otro, proporcion) }))
      .filter(({ d }) => d < distancia)
      .sort((x, y) => x.d - y.d)
      .map(({ otro }) => otro);
    if (vecinos.length > 0) resultado.set(lugar.id, vecinos);
  }
  return resultado;
}
