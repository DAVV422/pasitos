import {
  ACCIONES_EVENTO,
  ACCIONES_ESCRITURA,
  canDo,
  canManageRol,
  PERMISOS,
  ROLES_EVENTO,
  type AccionEvento,
  type RolEvento,
} from './matriz';

/**
 * La tabla de Flujos §2.4, copiada a mano (D dueño · C coorganizador · R registrador ·
 * M operador de mesa · S operador de stand · F financiador). Si cambia la matriz, este test falla
 * hasta que alguien cambie también Flujos §2.4 y esta copia, a conciencia.
 */
const FLUJOS_2_4: Readonly<Record<AccionEvento, string>> = {
  'evento.read': 'DCRMSF',
  'evento.update': 'DC', // Configurar el evento
  'evento.publish': 'DC', // … y publicarlo
  'evento.estado': 'DC',
  'evento.close': 'D', // Cerrar el evento
  'contenido.read': 'DCRMSF',
  'contenido.update': 'DC', // Crear y editar retos, agenda, mapa, stands y catálogo
  'equipo.read': 'DC',
  'equipo.update': 'DC', // Invitar y quitar colaboradores ¹
  'terminales.read': 'DC',
  'terminales.update': 'DC', // Conectar y desconectar pantallas y mesas
  'pantallas.control': 'DCS', // Controlar pantallas ²
  'mesas.cobrar': 'DCM', // Cobrar canjes ²
  'invitados.read': 'DCR',
  'invitados.update': 'DC', // Cargar invitados y enviar invitaciones
  'invitados.export': 'DC', // Descargar datos personales
  'puerta.use': 'DCR', // Buscar invitados, check-in, registrar, vincular
  'puntos.ajustar': 'DC', // Ajustes manuales y anular canjes
  'grupos.update': 'DC', // Crear grupos y agregar personas
  'qr_registro.read': 'DC',
  'qr_registro.update': 'DC', // Crear y administrar los QR de registro
  'puerta.activar': 'DCR', // Mostrar el QR de registro asignado (Activar cuentas)
  'panel.read': 'DCRSF', // Panel en vivo (R: solo asistencia · S: sus pantallas · F: lectura)
  'bitacora.read': 'DC',
  'reporte.read': 'DCF',
};

const LETRA: Readonly<Record<RolEvento, string>> = {
  dueno: 'D',
  coorganizador: 'C',
  registrador: 'R',
  operador_mesa: 'M',
  operador_stand: 'S',
  financiador: 'F',
};

describe('Matriz de permisos (HU-204)', () => {
  it('tiene exactamente las acciones de la copia de Flujos §2.4', () => {
    expect([...ACCIONES_EVENTO].sort()).toEqual(Object.keys(FLUJOS_2_4).sort());
  });

  it.each(ACCIONES_EVENTO)('%s: los mismos roles que Flujos §2.4', (accion) => {
    const segunMatriz = ROLES_EVENTO.filter((rol) => canDo(rol, accion))
      .map((rol) => LETRA[rol])
      .join('');
    expect(segunMatriz).toBe(FLUJOS_2_4[accion]);
  });

  it('el financiador solo lee', () => {
    const escribe = ACCIONES_EVENTO.filter(
      (accion) => ACCIONES_ESCRITURA.has(accion) && canDo('financiador', accion),
    );
    expect(escribe).toEqual([]);
  });

  it('las acciones de escritura existen en la matriz', () => {
    for (const accion of ACCIONES_ESCRITURA) {
      expect(PERMISOS[accion]).toBeDefined();
    }
  });

  it('¹ un coorganizador no maneja a otro coorganizador ni al dueño', () => {
    expect(canManageRol('dueno', 'coorganizador')).toBe(true);
    expect(canManageRol('coorganizador', 'registrador')).toBe(true);
    expect(canManageRol('coorganizador', 'coorganizador')).toBe(false);
    expect(canManageRol('coorganizador', 'dueno')).toBe(false);
    expect(canManageRol('dueno', 'dueno')).toBe(false);
    expect(canManageRol('registrador', 'financiador')).toBe(false);
  });
});
