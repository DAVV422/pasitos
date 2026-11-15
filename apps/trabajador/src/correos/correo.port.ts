/** Un correo listo para el proveedor. */
export interface MensajeCorreo {
  readonly de: string;
  readonly para: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
  /** Para buscarlo en el proveedor: tipo e id del envío. Nunca datos personales. */
  readonly etiquetas: Readonly<Record<string, string>>;
}

/**
 * Proveedor de correo (T-007 §2). En desarrollo, SMTP a Mailpit; en los tests, a archivos;
 * en producción, Resend (con el despliegue, T-002).
 */
export interface CorreoPort {
  send(mensaje: MensajeCorreo): Promise<{ readonly proveedorId: string }>;
}

/** Error del proveedor. `temporal`: se reintenta (red, límite por segundo, 5xx). */
export class CorreoError extends Error {
  constructor(
    message: string,
    readonly temporal: boolean,
  ) {
    super(message);
    this.name = 'CorreoError';
  }
}
