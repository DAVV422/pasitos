/**
 * Por qué se le da un acceso nuevo a quien ya tenía un celular (HU-304 §1). El motivo queda en la
 * vinculación anulada (`motivo_anulacion`) y en la bitácora.
 */
export const TIPOS_MOTIVO_REVINCULAR = [
  'cambio_celular',
  'borro_datos',
  'se_vinculo_otra_persona',
  'otro',
] as const;
export type TipoMotivoRevincular = (typeof TIPOS_MOTIVO_REVINCULAR)[number];

export const NOMBRES_MOTIVO_REVINCULAR: Readonly<Record<TipoMotivoRevincular, string>> = {
  cambio_celular: 'Cambió de celular',
  borro_datos: 'Borró los datos del navegador',
  se_vinculo_otra_persona: 'Lo vinculó otra persona',
  otro: 'Otro',
};

export interface MotivoRevincular {
  readonly tipo: TipoMotivoRevincular;
  readonly texto?: string | undefined;
  /** HU-305: el aviso *No fui yo* que se cierra al vincular. */
  readonly alertaId?: string | undefined;
}

/** Cuando el celular nuevo se abrió con el enlace de la invitación (sin pasar por la puerta). */
export const MOTIVO_NUEVA_VINCULACION = 'nueva_vinculacion';

/** Lo que se guarda en `motivo_anulacion`: el tipo, o `otro: <texto>`. */
export function toMotivoAnulacion(motivo: MotivoRevincular | null): string {
  if (!motivo) return MOTIVO_NUEVA_VINCULACION;
  return motivo.tipo === 'otro' && motivo.texto ? `otro: ${motivo.texto}` : motivo.tipo;
}

/**
 * Si la vinculación se anuló porque otro celular abrió la entrada (y no por el equipo). Ese
 * celular todavía puede decir *No fui yo* (HU-312 §3).
 */
export function isAnuladaPorVinculacion(motivoAnulacion: string | null): boolean {
  if (!motivoAnulacion) return false;
  return (
    motivoAnulacion === MOTIVO_NUEVA_VINCULACION ||
    motivoAnulacion.startsWith('otro') ||
    (TIPOS_MOTIVO_REVINCULAR as readonly string[]).includes(motivoAnulacion)
  );
}

/** *"Cambió de celular"*, para la ficha de la puerta. */
export function describeMotivoAnulacion(motivoAnulacion: string | null): string | null {
  if (!motivoAnulacion) return null;
  if (motivoAnulacion === MOTIVO_NUEVA_VINCULACION) return 'Abrió su enlace en otro celular';
  if (motivoAnulacion.startsWith('otro: ')) return motivoAnulacion.slice(6);
  return NOMBRES_MOTIVO_REVINCULAR[motivoAnulacion as TipoMotivoRevincular] ?? motivoAnulacion;
}
