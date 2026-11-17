/**
 * Conexión de las pantallas y mesas: vigencias, latido, estado y mensajes. Sin Zod: lo usa
 * `TerminalService` (web-core) en /sala y /mesa, que así no cargan los esquemas.
 */

/** Vigencia de los dos tokens de conexión (V12). */
export const VIGENCIA_QR_CONEXION_MS = 2 * 60_000;
export const VIGENCIA_ENLACE_CONEXION_MS = 24 * 3_600_000;
/** La terminal avisa cada 30 s; **en línea** si avisó hace menos de 90 s. */
export const LATIDO_MS = 30_000;
export const EN_LINEA_MS = 90_000;

export type EstadoConexion = 'en_linea' | 'sin_conexion' | 'desconectada';

export function getEstadoConexion(
  estado: string,
  ultimoContactoAt: Date | string | null,
  ahora: Date,
): EstadoConexion {
  if (estado === 'desconectada') {
    return 'desconectada';
  }
  const ultimo = ultimoContactoAt === null ? 0 : new Date(ultimoContactoAt).getTime();
  return ahora.getTime() - ultimo < EN_LINEA_MS ? 'en_linea' : 'sin_conexion';
}

export const NOMBRES_ESTADO_CONEXION: Readonly<Record<EstadoConexion, string>> = {
  en_linea: 'En línea',
  sin_conexion: 'Sin conexión',
  desconectada: 'Desconectada',
};

/** Lo que muestran `/sala/conectar` y `/mesa/conectar` según el código de error (HU-209 §4). */
export const MENSAJES_CONEXION: Readonly<Record<string, string>> = {
  ENLACE_YA_USADO: 'Este enlace ya se usó. Pide uno nuevo al organizador.',
  ENLACE_VENCIDO: 'Este enlace venció. Pide uno nuevo al organizador.',
  TERMINAL_DESCONECTADA: 'Esta pantalla se desconectó. Pide que la conecten de nuevo.',
};

/** *Tablet Sala A* → *Tablet Sala A (2)* → *Tablet Sala A (3)*. */
export function buildNombreReemplazo(nombre: string): string {
  const conNumero = /^(.*) \((\d+)\)$/.exec(nombre);
  return conNumero ? `${conNumero[1]} (${Number(conNumero[2]) + 1})` : `${nombre} (2)`;
}
