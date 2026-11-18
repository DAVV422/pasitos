/**
 * Por qué se ajustan puntos a mano (HU-317 §1). En el libro y en el lote público va **solo la
 * categoría** (Contrato §4.1): el texto de *Otro* queda para el equipo.
 */
export const TIPOS_MOTIVO_AJUSTE = ['falla_qr', 'compensacion', 'correccion', 'otro'] as const;
export type TipoMotivoAjuste = (typeof TIPOS_MOTIVO_AJUSTE)[number];

/** La categoría tal como queda en el libro y se publica. */
export const CATEGORIAS_AJUSTE: Readonly<Record<TipoMotivoAjuste, string>> = {
  falla_qr: 'Falló el QR',
  compensacion: 'Compensación',
  correccion: 'Corrección',
  otro: 'Otro',
};
