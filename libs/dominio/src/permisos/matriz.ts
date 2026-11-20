/**
 * Matriz de permisos por rol del evento (HU-204, Flujos §2.4, D19). **Única fuente**: el servidor
 * decide con ella y el panel solo la usa para ocultar menús y botones. Un test la compara con la
 * tabla de Flujos §2.4 escrita a mano, para que un cambio en una obligue a cambiar la otra.
 */
export const ROLES_EVENTO = [
  'dueno',
  'coorganizador',
  'registrador',
  'operador_mesa',
  'operador_stand',
  'financiador',
] as const;
export type RolEvento = (typeof ROLES_EVENTO)[number];

/** Los roles que se invitan (el dueño es el de la organización, HU-203). */
export const ROLES_INVITABLES = ROLES_EVENTO.filter(
  (rol): rol is Exclude<RolEvento, 'dueno'> => rol !== 'dueno',
);

export const NOMBRES_ROL: Readonly<Record<RolEvento, string>> = {
  dueno: 'Dueño',
  coorganizador: 'Coorganizador',
  registrador: 'Registrador',
  operador_mesa: 'Operador de mesa',
  operador_stand: 'Operador de stand',
  financiador: 'Financiador',
};

const TODOS = ROLES_EVENTO;
const DC = ['dueno', 'coorganizador'] as const;

/** Una acción por fila de Flujos §2.4, separando lectura de escritura donde una fila mezcla las dos. */
export const PERMISOS = {
  'evento.read': TODOS,
  'evento.update': DC,
  'evento.publish': DC,
  /** Abrir, pausar y reanudar. */
  'evento.estado': DC,
  'evento.close': ['dueno'],
  'contenido.read': TODOS,
  /** Lugares, agenda, sponsors, preguntas, retos, premios y archivos. */
  'contenido.update': DC,
  'equipo.read': DC,
  /** Con la regla ¹: un coorganizador no toca a otro coorganizador ni al dueño (HU-203). */
  'equipo.update': DC,
  /** Ver las pantallas y mesas, con su conexión. */
  'terminales.read': DC,
  /** Crear, conectar y desconectar pantallas y mesas. */
  'terminales.update': DC,
  /** ² Solo las pantallas asignadas al operador de stand. */
  'pantallas.control': [...DC, 'operador_stand'],
  /** ² Solo las mesas asignadas al operador de mesa. */
  'mesas.cobrar': [...DC, 'operador_mesa'],
  /** Ver y buscar en la lista de invitados (el registrador, con el correo enmascarado). */
  'invitados.read': [...DC, 'registrador'],
  /** Cargar, importar y enviar invitaciones. */
  'invitados.update': DC,
  /** Descargar datos personales. */
  'invitados.export': DC,
  /** Buscar invitados, check-in, registrar en la puerta y vincular. */
  'puerta.use': [...DC, 'registrador'],
  'puntos.ajustar': DC,
  /**
   * HU-321: verificar el carnet. Además, cualquier miembro con *Verifica carnets* (lo revisa el
   * servicio: la matriz es por rol).
   */
  'ci.verify': [...DC, 'registrador'],
  /**
   * HU-323: revisar las fotos de todos los retos. Además, los responsables de cada reto, solo las
   * de sus retos (lo revisa el servicio: la matriz es por rol).
   */
  'fotos.review': DC,
  /** HU-324: descargar las fotos aprobadas con autorización, para redes. */
  'fotos.descargar': DC,
  /** HU-325: crear grupos y agregar o quitar personas. */
  'grupos.update': DC,
  /** HU-319: ver los QR de registro. */
  'qr_registro.read': DC,
  /** HU-319: crear, editar, invalidar y descargar los QR de registro. */
  'qr_registro.update': DC,
  /** HU-319: mostrar en el celular el QR de registro rotativo asignado (*Activar cuentas*). */
  'puerta.activar': [...DC, 'registrador'],
  'panel.read': [...DC, 'registrador', 'operador_stand', 'financiador'],
  'bitacora.read': DC,
  'reporte.read': [...DC, 'financiador'],
  /** HU-402: volver a armar el reporte desde la base. */
  'reporte.regenerate': DC,
  /** HU-402 §5: hacerlo público, dejar de compartir y cambiar el enlace. */
  'reporte.share': ['dueno'],
} as const satisfies Record<string, readonly RolEvento[]>;

export type AccionEvento = keyof typeof PERMISOS;
export const ACCIONES_EVENTO = Object.keys(PERMISOS) as AccionEvento[];

/** Acciones que cambian algo: con el evento cerrado responden EVENTO_CERRADO. */
export const ACCIONES_ESCRITURA: ReadonlySet<AccionEvento> = new Set<AccionEvento>([
  'evento.update',
  'evento.publish',
  'evento.estado',
  'contenido.update',
  'equipo.update',
  'terminales.update',
  'pantallas.control',
  'mesas.cobrar',
  'invitados.update',
  'puerta.use',
  'puntos.ajustar',
  'qr_registro.update',
  'grupos.update',
  'ci.verify',
  'fotos.review',
  'fotos.descargar',
]);

/** Acciones que, para los operadores, valen solo en sus terminales asignadas (²). */
export const ACCIONES_POR_TERMINAL: Readonly<Partial<Record<AccionEvento, RolEvento>>> = {
  'pantallas.control': 'operador_stand',
  'mesas.cobrar': 'operador_mesa',
};

export function canDo(rol: RolEvento, accion: AccionEvento): boolean {
  return (PERMISOS[accion] as readonly RolEvento[]).includes(rol);
}

export function isRolEvento(valor: string): valor is RolEvento {
  return (ROLES_EVENTO as readonly string[]).includes(valor);
}

/** ¹ Un coorganizador no invita, cambia ni quita a un coorganizador ni al dueño. */
export function canManageRol(actor: RolEvento, objetivo: RolEvento): boolean {
  if (actor === 'dueno') {
    return objetivo !== 'dueno';
  }
  return actor === 'coorganizador' && objetivo !== 'dueno' && objetivo !== 'coorganizador';
}
