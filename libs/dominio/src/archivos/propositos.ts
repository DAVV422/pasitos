/**
 * Qué se puede subir y con qué límites (Subida de archivos §1, HU-214). Lo usan el API (decide) y
 * el panel (muestra formatos, peso y medidas en el campo).
 */
const MB = 1024 * 1024;

export interface DefinicionProposito {
  readonly tipo: 'imagen' | 'csv';
  readonly maxBytes: number;
  /** Ancho y alto máximos, en píxeles (solo imágenes). */
  readonly maxLado: number;
  /** Lo sube el equipo (`false`: lo crea el servidor, como el mapa estático). */
  readonly subible: boolean;
  readonly texto: string;
}

export const PROPOSITOS_ARCHIVO = {
  logo_evento: {
    tipo: 'imagen',
    maxBytes: 2 * MB,
    maxLado: 2_000,
    subible: true,
    texto: 'Logo del evento',
  },
  portada: { tipo: 'imagen', maxBytes: 5 * MB, maxLado: 4_000, subible: true, texto: 'Portada' },
  plano: {
    tipo: 'imagen',
    maxBytes: 5 * MB,
    maxLado: 6_000,
    subible: true,
    texto: 'Plano del lugar',
  },
  logo_sponsor: {
    tipo: 'imagen',
    maxBytes: 2 * MB,
    maxLado: 2_000,
    subible: true,
    texto: 'Logo del sponsor',
  },
  imagen_premio: {
    tipo: 'imagen',
    maxBytes: 2 * MB,
    maxLado: 2_000,
    subible: true,
    texto: 'Imagen del premio',
  },
  importacion_csv: {
    tipo: 'csv',
    maxBytes: 2 * MB,
    maxLado: 0,
    subible: true,
    texto: 'Lista de invitados',
  },
  mapa_estatico: {
    tipo: 'imagen',
    maxBytes: 2 * MB,
    maxLado: 2_000,
    subible: false,
    texto: 'Mapa',
  },
} as const satisfies Record<string, DefinicionProposito>;

export type PropositoArchivo = keyof typeof PROPOSITOS_ARCHIVO;

export function isPropositoSubible(valor: string): valor is PropositoArchivo {
  return (
    Object.hasOwn(PROPOSITOS_ARCHIVO, valor) &&
    PROPOSITOS_ARCHIVO[valor as PropositoArchivo].subible
  );
}

/** Formatos de imagen: la extensión y el tipo declarado tienen que estar aquí (paso 1). */
export const EXTENSIONES_IMAGEN = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const MIMES_IMAGEN = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const VARIANTES_IMAGEN = ['original', '1200', '400'] as const;
export type VarianteImagen = (typeof VARIANTES_IMAGEN)[number];

/** "PNG, JPEG o WebP · hasta 2 MB · hasta 2000 × 2000 px", para el campo del panel. */
export function describeProposito(proposito: PropositoArchivo): string {
  const definicion = PROPOSITOS_ARCHIVO[proposito];
  const peso = `hasta ${definicion.maxBytes / MB} MB`;
  return definicion.tipo === 'csv'
    ? `CSV en UTF-8 · ${peso} · hasta 5000 filas`
    : `PNG, JPEG o WebP · ${peso} · hasta ${definicion.maxLado} × ${definicion.maxLado} px`;
}
