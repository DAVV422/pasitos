import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ACCIONES_ESCRITURA, ACCIONES_POR_TERMINAL, AppError, canDo } from '@pasitos/dominio';
import type { RequestConSesion } from '../sesion/sesion';
import { META_PERMISO, type DefinicionPermiso, type RequestConContexto } from './marcas';
import type { RolesCache, RolesRepository } from './roles.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guard de permisos del evento (HU-204 §2), después del de sesión. Resuelve el evento de la ruta
 * (`:eventoId` o el recurso), el rol de la persona y aplica la matriz. Deja `request.contexto`.
 */
export class PermisosGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: RolesRepository,
    private readonly cache: RolesCache,
  ) {}

  async canActivate(ejecucion: ExecutionContext): Promise<boolean> {
    const definicion = this.reflector.getAllAndOverride<DefinicionPermiso | undefined>(
      META_PERMISO,
      [ejecucion.getHandler(), ejecucion.getClass()],
    );
    if (!definicion) {
      return true;
    }
    const request = ejecucion.switchToHttp().getRequest<RequestConSesion & RequestConContexto>();
    const sesion = request.sesion;
    if (!sesion) {
      throw new AppError('NO_AUTENTICADO');
    }
    const parametros = request.params as Record<string, string | undefined>;

    const eventoId = await this.resolveEventoId(definicion, parametros);
    const evento = eventoId ? await this.roles.findEvento(eventoId) : null;
    if (!evento) {
      throw new AppError('NO_ENCONTRADO');
    }
    let rol = this.cache.get(sesion.usuario.id, evento.id);
    if (rol === undefined) {
      rol = await this.roles.findRol(sesion.usuario.id, evento);
      this.cache.set(sesion.usuario.id, evento.id, rol);
    }
    // Sin rol en el evento: 404, para no revelar que existe.
    if (!rol) {
      throw new AppError('NO_ENCONTRADO');
    }
    if (!canDo(rol.rol, definicion.accion)) {
      throw new AppError('SIN_PERMISO');
    }
    // ² El operador solo en sus pantallas o mesas.
    if (ACCIONES_POR_TERMINAL[definicion.accion] === rol.rol) {
      const id = parametros[definicion.param ?? 'id'] ?? '';
      const suyas =
        definicion.recurso === 'pantallas' ? rol.terminales.pantallas : rol.terminales.mesas;
      if (!suyas.includes(id)) {
        throw new AppError('NO_ENCONTRADO');
      }
    }
    if (evento.estado === 'cerrado' && ACCIONES_ESCRITURA.has(definicion.accion)) {
      throw new AppError('EVENTO_CERRADO');
    }
    request.contexto = {
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      dispositivo: sesion.dispositivo,
      eventoId: evento.id,
      organizacionId: evento.organizacionId,
      eventoEstado: evento.estado,
      rol: rol.rol,
      miembroId: rol.miembroId,
      terminales: rol.terminales,
    };
    return true;
  }

  private async resolveEventoId(
    definicion: DefinicionPermiso,
    parametros: Record<string, string | undefined>,
  ): Promise<string | null> {
    const directo = parametros['eventoId'];
    if (directo !== undefined) {
      return UUID.test(directo) ? directo : null;
    }
    if (!definicion.recurso) {
      throw new AppError('ERROR_INTERNO', {
        detail: `@Permiso('${definicion.accion}') sin :eventoId ni recurso`,
      });
    }
    const id = parametros[definicion.param ?? 'id'];
    return id && UUID.test(id) ? this.roles.findEventoDeRecurso(definicion.recurso, id) : null;
  }
}
