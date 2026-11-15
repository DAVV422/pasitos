import type { ContextoEvento } from '../../common/permisos/marcas';
import type { ContextoSesion } from '../auth/sesiones.service';
import type { ActorBitacora } from './bitacora.service';

/** Quién, para la bitácora, desde el contexto del evento (rol del evento). */
export function toActor(contexto: ContextoEvento): ActorBitacora {
  return {
    tipo: 'usuario',
    id: contexto.usuarioId,
    nombre: contexto.usuarioNombre,
    rol: contexto.rol,
    dispositivo: contexto.dispositivo,
  };
}

/** Quién, para la bitácora, desde la sesión de la consola (rol de plataforma). */
export function toActorPlataforma(sesion: ContextoSesion): ActorBitacora {
  return {
    tipo: 'usuario',
    id: sesion.usuario.id,
    nombre: sesion.usuario.nombre,
    rol: sesion.usuario.rolPlataforma,
    dispositivo: sesion.dispositivo,
  };
}
