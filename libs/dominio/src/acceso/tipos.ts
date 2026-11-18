/** Cómo llega la persona a vincular su celular (API §5.1). `qr` y `corto` llegan con HU-302. */
export const TIPOS_ACCESO = ['invitacion', 'qr', 'corto'] as const;
export type TipoAcceso = (typeof TIPOS_ACCESO)[number];
