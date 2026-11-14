import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import {
  buildTipoError,
  CATALOGO_ERRORES,
  type CodigoError,
  type ErrorDeCampo,
  type ProblemDetails,
} from '@pasitos/dominio';
import * as Sentry from '@sentry/nestjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app-error';

/**
 * Convierte cualquier error en Problem Details (RFC 9457) con un código del catálogo
 * (Respuestas y errores del API §4–5). Nada interno llega al cliente.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const request = contexto.getRequest<FastifyRequest>();
    const reply = contexto.getResponse<FastifyReply>();
    const traceId = String(request.id);

    const { code, errors, meta, detail } = this.toCodigo(error);
    const definicion = CATALOGO_ERRORES[code];

    if (definicion.status >= 500) {
      this.logger.error({ err: error, traceId }, 'Error inesperado');
      Sentry.captureException(error, { tags: { traceId } });
    }

    const cuerpo: ProblemDetails = {
      type: buildTipoError(code),
      title: definicion.title,
      status: definicion.status,
      code,
      detail: detail ?? definicion.mensaje,
      traceId,
      ...(errors ? { errors } : {}),
      ...(meta ? { meta } : {}),
    };

    void reply
      .status(definicion.status)
      .header('Content-Type', 'application/problem+json')
      .send(cuerpo);
  }

  private toCodigo(error: unknown): {
    code: CodigoError;
    errors?: readonly ErrorDeCampo[];
    meta?: Readonly<Record<string, unknown>>;
    detail?: string;
  } {
    if (error instanceof AppError) {
      return {
        code: error.code,
        ...(error.errors ? { errors: error.errors } : {}),
        ...(error.meta ? { meta: error.meta } : {}),
      };
    }
    if (error instanceof ZodError) {
      return {
        code: 'VALIDACION',
        errors: error.issues.map((problema) => ({
          field: problema.path.join('.'),
          code: problema.code.toUpperCase(),
          message: problema.message,
        })),
      };
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === 404) return { code: 'NO_ENCONTRADO' };
      if (status === 401) return { code: 'NO_AUTENTICADO' };
      if (status === 403) return { code: 'SIN_PERMISO' };
      if (status === 429) return { code: 'DEMASIADOS_INTENTOS' };
      if (status === 503) return { code: 'SERVICIO_NO_DISPONIBLE' };
      if (status >= 400 && status < 500) return { code: 'VALIDACION' };
    }
    return { code: 'ERROR_INTERNO' };
  }
}
