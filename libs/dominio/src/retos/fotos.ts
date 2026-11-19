/**
 * Los retos con foto (HU-322, D61): la persona saca o sube una foto y el equipo la revisa
 * (HU-323). La foto llega achicada desde el celular y el trabajador la procesa.
 */
export const ORIGENES_FOTO = ['camara', 'galeria'] as const;
export type OrigenFoto = (typeof ORIGENES_FOTO)[number];

export const AUTORIZACIONES_USO = ['opcional', 'requerida'] as const;
export type AutorizacionUso = (typeof AUTORIZACIONES_USO)[number];

export const ESTADOS_ENVIO_FOTO = [
  'recibida',
  'en_revision',
  'rechazada_sistema',
  'aprobada',
  'rechazada',
  'anulada',
] as const;
export type EstadoEnvioFoto = (typeof ESTADOS_ENVIO_FOTO)[number];

/** Los motivos de rechazo de la revisión (HU-323 §2), con lo que ve la persona. */
export const MOTIVOS_RECHAZO_FOTO = {
  no_corresponde: 'No corresponde al reto',
  no_se_ve: 'No se ve bien',
  repetida: 'Repetida',
  inapropiada: 'No es apropiada',
  otro: 'Otro motivo',
  agotado: 'El reto ya entregó todos sus premios',
} as const;
export type MotivoRechazoFoto = keyof typeof MOTIVOS_RECHAZO_FOTO;

/** Lo que dice el trabajador si la imagen no se pudo leer (no cuenta como intento). */
export const MOTIVO_FOTO_ILEGIBLE = 'La foto no se pudo leer. Intenta con otra';

/** Cuántas fotos puede mandar un celular por hora (HU-322 §3). */
export const FOTOS_POR_HORA = 10;

/** El lado mayor de la foto achicada en el celular, y su calidad JPEG (HU-322 §5). */
export const LADO_FOTO_CELULAR = 1600;
export const CALIDAD_FOTO_CELULAR = 0.8;

/** Las medidas a las que se achica una foto, sin agrandarla nunca. */
export function getMedidasAchicadas(
  ancho: number,
  alto: number,
  ladoMaximo = LADO_FOTO_CELULAR,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMaximo) return { ancho, alto };
  const escala = ladoMaximo / mayor;
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Cuántos intentos le quedan: los rechazos de la revisión cuentan; los del sistema (la imagen
 * dañada) no.
 */
export function getIntentosRestantes(intentosMax: number, rechazadas: number): number {
  return Math.max(0, intentosMax - rechazadas);
}

/** Cuándo se borran las fotos después del cierre (HU-324 §3). */
export const DIAS_BORRADO_FOTOS = {
  /** Sin autorización, o con la autorización retirada. */
  sinAutorizacion: 30,
  /** Con la autorización vigente. */
  autorizadas: 90,
  /** Rechazadas como inapropiadas. */
  inapropiadas: 7,
} as const;

/** Qué plazo le toca a una foto. */
export function getDiasBorradoFoto(foto: {
  readonly motivoRechazo: string | null;
  readonly autorizaUso: boolean;
  readonly autorizaUsoRetiradaAt: Date | string | null;
}): number {
  if (foto.motivoRechazo === 'inapropiada') return DIAS_BORRADO_FOTOS.inapropiadas;
  return foto.autorizaUso && !foto.autorizaUsoRetiradaAt
    ? DIAS_BORRADO_FOTOS.autorizadas
    : DIAS_BORRADO_FOTOS.sinAutorizacion;
}
