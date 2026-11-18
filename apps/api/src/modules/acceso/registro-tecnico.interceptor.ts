import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AppError } from '@pasitos/dominio';
import { catchError, from, mergeMap, type Observable, throwError } from 'rxjs';
import {
  META_ASISTENTE,
  type OpcionesAsistente,
  type RequestConAsistente,
} from '../../common/sesion/asistente';
import type { Reloj } from '../auth/sesiones.service';
import { getTecnicoDelPedido } from './asistente.guard';
import type { RegistroTecnicoService } from './registro-tecnico';

/**
 * HU-307 §4: cada reclamo, canje y foto deja su registro técnico (la diferencia de reloj y la
 * latencia), también si falla. Se escribe después del caso de uso y aparte de su transacción.
 */
export class RegistroTecnicoInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly registro: RegistroTecnicoService,
    private readonly reloj: Reloj,
  ) {}

  intercept(ejecucion: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const opciones = this.reflector.getAllAndOverride<OpcionesAsistente | undefined>(
      META_ASISTENTE,
      [ejecucion.getHandler(), ejecucion.getClass()],
    );
    const request = ejecucion.switchToHttp().getRequest<RequestConAsistente>();
    const momento = opciones?.momento;
    const asistente = request.asistente;
    if (!momento || !asistente) {
      return siguiente.handle();
    }
    const guardar = (resultado: 'aceptado' | 'rechazado', motivo: string | null) =>
      this.registro.recordAparte(asistente.organizacionId, {
        ...getTecnicoDelPedido(request, asistente),
        momento,
        resultado,
        motivo,
        latenciaMs:
          request.llegadaMs === undefined ? null : this.reloj.now().getTime() - request.llegadaMs,
      });
    return siguiente.handle().pipe(
      mergeMap((respuesta) => from(guardar('aceptado', null).then(() => respuesta))),
      catchError((error: unknown) =>
        from(guardar('rechazado', error instanceof AppError ? error.code : 'ERROR_INTERNO')).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
