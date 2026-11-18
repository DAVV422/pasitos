import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { AppError } from '@pasitos/dominio';
import type { FastifyRequest } from 'fastify';

export const META_ASISTENTE = 'pasitos:asistente';

export interface OpcionesAsistente {
  /**
   * Operación que mueve puntos: además de la sesión, la firma del dispositivo, la hora del
   * celular (±5 min) y la `Idempotency-Key` (API §2.1, HU-306 §4).
   */
  readonly firmado?: boolean;
}

/** Ruta del asistente vinculado (`/app/*`): sesión `px_asistente`, no la del equipo. */
export const Asistente = (opciones: OpcionesAsistente = {}) =>
  SetMetadata(META_ASISTENTE, opciones);

/** Lo que el guard del asistente deja en la request. */
export interface ContextoAsistente {
  readonly sessionId: string;
  readonly organizacionId: string;
  readonly eventoId: string;
  readonly asistenteId: string;
  readonly vinculacionId: string;
  readonly dispositivoId: string;
}

/** En las rutas firmadas: lo que se firmó, para la idempotencia y el libro. */
export interface FirmaVerificada {
  readonly clave: string;
  readonly timestamp: number;
  /** El SHA-256 del cuerpo, en base64url. */
  readonly hashCuerpo: string;
  /** La firma (r‖s), para guardarla en el movimiento (`firma_dispositivo`). */
  readonly firma: Uint8Array;
  readonly ruta: string;
}

export type RequestConAsistente = FastifyRequest & {
  asistente?: ContextoAsistente;
  firma?: FirmaVerificada;
  /** El cuerpo tal como llegó (`rawBody: true` en la app), para el hash firmado. */
  rawBody?: Buffer;
};

/** El asistente de la sesión, en el controlador. */
export const AsistenteActual = createParamDecorator((_: unknown, ejecucion: ExecutionContext) => {
  const asistente = ejecucion.switchToHttp().getRequest<RequestConAsistente>().asistente;
  if (!asistente) {
    throw new AppError('ERROR_INTERNO', { detail: 'Ruta sin @Asistente' });
  }
  return asistente;
});

/** La firma verificada, en las rutas `@Asistente({ firmado: true })`. */
export const Firma = createParamDecorator((_: unknown, ejecucion: ExecutionContext) => {
  const firma = ejecucion.switchToHttp().getRequest<RequestConAsistente>().firma;
  if (!firma) {
    throw new AppError('ERROR_INTERNO', { detail: 'Ruta sin @Asistente({ firmado: true })' });
  }
  return firma;
});
