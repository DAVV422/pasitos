import {
  createParamDecorator,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AppError } from '@pasitos/dominio';
import type { FastifyRequest } from 'fastify';
import {
  COOKIE_EQUIPO,
  type ContextoSesion,
  type SesionesService,
} from '../../modules/auth/sesiones.service';
import { META_ASISTENTE } from './asistente';

export const META_PUBLICA = 'pasitos:publica';
export const META_SEGUNDO_FACTOR = 'pasitos:segundo-factor';

/** Ruta sin sesión (`/auth/login`, `/salud`, `/publico/*`…). */
export const Publica = () => SetMetadata(META_PUBLICA, true);

/**
 * Ruta que se puede usar sin haber pasado el segundo factor (HU-201 §4):
 * - `configurar`: para darlo de alta (si no tiene ninguno, o ya lo pasó);
 * - `verificar`: para pasarlo;
 * - `cualquiera`: `/auth/yo` y `/auth/logout`.
 */
export type PermisoSinSegundoFactor = 'configurar' | 'verificar' | 'cualquiera';
export const SinSegundoFactor = (permiso: PermisoSinSegundoFactor) =>
  SetMetadata(META_SEGUNDO_FACTOR, permiso);

export type RequestConSesion = FastifyRequest & { sesion?: ContextoSesion };

/** El contexto de la sesión en el controlador. */
export const Sesion = createParamDecorator((_: unknown, contexto: ExecutionContext) => {
  const sesion = contexto.switchToHttp().getRequest<RequestConSesion>().sesion;
  if (!sesion) {
    throw new AppError('NO_AUTENTICADO');
  }
  return sesion;
});

/**
 * Guard global de la sesión del equipo (HU-201, HU-204 §2): lee `px_equipo`, deja
 * `request.sesion` y hace cumplir el segundo factor. Toda ruta pide sesión salvo `@Publica()`.
 */
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sesiones: SesionesService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    // Las rutas públicas y las del asistente (su sesión la revisa AsistenteGuard, HU-306).
    if (
      this.reflector.getAllAndOverride<boolean>(META_PUBLICA, objetivos) ||
      this.reflector.getAllAndOverride<object>(META_ASISTENTE, objetivos)
    ) {
      return true;
    }
    const request = contexto.switchToHttp().getRequest<RequestConSesion>();
    const sesion = await this.sesiones.authenticate(request.cookies[COOKIE_EQUIPO]);
    request.sesion = sesion;

    const permiso = this.reflector.getAllAndOverride<PermisoSinSegundoFactor | undefined>(
      META_SEGUNDO_FACTOR,
      objetivos,
    );
    const { estado } = sesion.segundoFactor;
    if (estado === 'ok' || estado === 'no_aplica' || permiso === 'cualquiera') {
      return true;
    }
    if (estado === 'por_configurar' && permiso === 'configurar') {
      return true;
    }
    if (estado === 'por_verificar' && permiso === 'verificar') {
      return true;
    }
    throw new AppError('SEGUNDO_FACTOR_REQUERIDO', {
      meta: { motivo: estado === 'por_configurar' ? 'configurar' : 'verificar' },
    });
  }
}
