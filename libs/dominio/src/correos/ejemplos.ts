import type { DatosCorreo, TipoCorreo } from './catalogo';

/**
 * Datos inventados de cada correo, para las pruebas y para `pnpm correos:vista`. El tipo obliga a
 * sumar un ejemplo al sumar un correo al catálogo.
 */
export const EJEMPLOS_CORREO: { readonly [T in TipoCorreo]: DatosCorreo<T> } = {
  restablecer_password: {
    nombre: 'Ana',
    enlace: 'http://localhost:4200/admin/restablecer/ejemplo',
  },
  password_cambiada: { nombre: 'Ana', fecha: '21/11/2026', hora: '15:00' },
  cuenta_bloqueada: { nombre: 'Ana', enlace: 'http://localhost:4200/admin/recuperar' },
  segundo_factor_restablecido: { nombre: 'Ana', enlace: 'http://localhost:4200/admin/entrar' },
  invitacion_organizacion: {
    nombre: 'Ana',
    quienInvita: 'Luis',
    organizacion: 'Comunidad de Ejemplo',
    enlace: 'http://localhost:4200/admin/invitacion/ejemplo',
  },
  invitacion_plataforma: {
    nombre: 'Ana',
    quienInvita: 'Luis',
    rol: 'soporte',
    enlace: 'http://localhost:4200/plataforma/invitacion/ejemplo',
  },
  rol_plataforma_asignado: {
    nombre: 'Ana',
    quienInvita: 'Luis',
    rol: 'administrador',
    enlace: 'http://localhost:4200/plataforma/entrar',
  },
  invitacion_equipo: {
    nombre: 'Ana',
    quienInvita: 'Luis',
    rol: 'registradora',
    evento: 'Encuentro de Ejemplo 2026',
    fecha: '21/11/2026',
    queHace: 'Vas a recibir a los asistentes en la puerta',
    enlace: 'http://localhost:4200/admin/invitacion/ejemplo',
  },
  invitacion_evento: {
    nombre: 'Ana',
    evento: 'Encuentro de Ejemplo 2026',
    fecha: '21/11/2026',
    lugar: 'Centro de Convenciones de Ejemplo',
    nombrePuntos: 'pasos',
    codigo: 'A7K2',
    organizacion: 'Comunidad de Ejemplo',
    enlace: 'http://localhost:4200/app/acceso/invitacion/ejemplo',
  },
  cierre_automatico: {
    nombre: 'Ana',
    evento: 'Encuentro de Ejemplo 2026',
    fechaFin: '21/11/2026',
    hora: '19:00',
    enlace: 'http://localhost:4200/admin/eventos/ejemplo/cierre',
  },
  registro_puerta: {
    nombre: 'Carla',
    evento: 'Encuentro de Ejemplo 2026',
    fecha: '21/11/2026',
    lugar: 'Centro de Convenciones de Ejemplo',
    codigo: 'A-0232',
  },
};
