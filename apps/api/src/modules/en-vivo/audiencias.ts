import type { RolEvento } from '@pasitos/dominio';

/**
 * Quién escucha un canal de avisos en vivo (T-301 §2). Cada canal recibe solo lo suyo y lo del
 * evento: un asistente no ve nada de otro, una mesa nada de otra mesa.
 */
export type Suscriptor =
  | {
      readonly tipo: 'equipo';
      readonly eventoId: string;
      readonly usuarioId: string;
      readonly rol: RolEvento;
      readonly pantallas: readonly string[];
      readonly mesas: readonly string[];
    }
  | {
      readonly tipo: 'asistente';
      readonly eventoId: string;
      readonly asistenteId: string;
      readonly dispositivoId: string;
    }
  | { readonly tipo: 'pantalla'; readonly eventoId: string; readonly pantallaId: string }
  | { readonly tipo: 'mesa'; readonly eventoId: string; readonly mesaId: string };

/** Una fila de `outbox` tal como se reparte. */
export interface AvisoOutbox {
  readonly id: string;
  readonly tipo: string;
  readonly eventoId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Lo que se manda por el canal: el nombre del evento SSE y sus datos. */
export interface AvisoEnVivo {
  readonly evento: string;
  readonly datos: Readonly<Record<string, unknown>>;
  /** Clave para agrupar (como mucho uno por segundo): los contadores de una pantalla. */
  readonly agrupar?: string;
  /** El canal se cierra después de mandarlo (un dispositivo anulado). */
  readonly cerrar?: boolean;
}

/** Dueño, coorganizador y financiador ven el evento entero (API §4.9). */
const TODO_EL_EVENTO: readonly RolEvento[] = ['dueno', 'coorganizador', 'financiador'];
const ORGANIZADORES: readonly RolEvento[] = ['dueno', 'coorganizador'];
const PUERTA: readonly RolEvento[] = ['dueno', 'coorganizador', 'registrador'];

function texto(payload: Readonly<Record<string, unknown>>, campo: string): string | null {
  const valor = payload[campo];
  return typeof valor === 'string' ? valor : null;
}

/** Los datos que se mandan: sin el evento (el canal ya es del evento). */
function datosDe(payload: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([campo]) => campo !== 'eventoId' && campo !== 'organizacionId'),
  );
}

function isEquipo(
  suscriptor: Suscriptor,
  roles: readonly RolEvento[],
): suscriptor is Extract<Suscriptor, { tipo: 'equipo' }> {
  return suscriptor.tipo === 'equipo' && roles.includes(suscriptor.rol);
}

/** El equipo que ve una pantalla: los organizadores y el operador de stand que la tiene. */
function veLaPantalla(suscriptor: Suscriptor, pantallaId: string | null): boolean {
  if (suscriptor.tipo === 'pantalla') {
    return suscriptor.pantallaId === pantallaId;
  }
  if (suscriptor.tipo !== 'equipo') {
    return false;
  }
  return (
    TODO_EL_EVENTO.includes(suscriptor.rol) ||
    (suscriptor.rol === 'operador_stand' &&
      pantallaId !== null &&
      suscriptor.pantallas.includes(pantallaId))
  );
}

/** El equipo que ve una mesa: los organizadores y el operador de mesa que la tiene. */
function veLaMesa(suscriptor: Suscriptor, mesaId: string | null): boolean {
  if (suscriptor.tipo === 'mesa') {
    return suscriptor.mesaId === mesaId;
  }
  if (suscriptor.tipo !== 'equipo') {
    return false;
  }
  return (
    ORGANIZADORES.includes(suscriptor.rol) ||
    (suscriptor.rol === 'operador_mesa' && mesaId !== null && suscriptor.mesas.includes(mesaId))
  );
}

/**
 * Qué recibe `suscriptor` de un aviso de `outbox`, o `null` si no le toca (API §8). Los tipos que
 * no están aquí (trabajos de Stellar, contenido) no salen por los canales.
 */
export function toAvisoEnVivo(aviso: AvisoOutbox, suscriptor: Suscriptor): AvisoEnVivo | null {
  if (aviso.eventoId !== suscriptor.eventoId) {
    return null;
  }
  const { payload } = aviso;
  const datos = datosDe(payload);
  switch (aviso.tipo) {
    // El saldo, solo a su dueño; al panel le basta el contador del reto.
    case 'movimiento.creado':
      return suscriptor.tipo === 'asistente' &&
        suscriptor.asistenteId === texto(payload, 'asistenteId')
        ? { evento: 'saldo.actualizado', datos: { saldo: payload['saldo'] } }
        : null;

    case 'contador.actualizado': {
      const pantallaId = texto(payload, 'pantallaId');
      return veLaPantalla(suscriptor, pantallaId)
        ? {
            evento: aviso.tipo,
            datos,
            agrupar: `contador:${pantallaId ?? texto(payload, 'retoId')}`,
          }
        : null;
    }

    case 'pantalla.epoca':
    case 'pantalla.pausada':
    case 'pantalla.reanudada':
    case 'pantalla.reto':
      return veLaPantalla(suscriptor, texto(payload, 'pantallaId'))
        ? { evento: aviso.tipo, datos }
        : null;

    case 'pantalla.conectada':
      return isEquipo(suscriptor, ORGANIZADORES)
        ? { evento: 'terminal.conectada', datos: { tipo: 'pantalla', ...datos } }
        : null;

    // `{ tipo: 'pantalla' | 'mesa', id }` (HU-209): a esa terminal y a los organizadores.
    case 'terminal.desconectada': {
      const id = texto(payload, 'id');
      const tipo = texto(payload, 'tipo');
      const esa =
        (suscriptor.tipo === 'pantalla' && tipo === 'pantalla' && suscriptor.pantallaId === id) ||
        (suscriptor.tipo === 'mesa' && tipo === 'mesa' && suscriptor.mesaId === id);
      return esa || isEquipo(suscriptor, ORGANIZADORES)
        ? { evento: aviso.tipo, datos, ...(esa ? { cerrar: true } : {}) }
        : null;
    }

    case 'canje.confirmado':
    case 'canje.vencido':
      return veLaMesa(suscriptor, texto(payload, 'mesaId')) ? { evento: aviso.tipo, datos } : null;

    case 'stock.bajo':
      return suscriptor.tipo === 'mesa' || isEquipo(suscriptor, ORGANIZADORES)
        ? { evento: aviso.tipo, datos }
        : null;

    case 'canje.anulado':
      return isEquipo(suscriptor, ORGANIZADORES) ? { evento: aviso.tipo, datos } : null;

    // El QR de asistente: solo a quien lo generó (HU-302).
    case 'acceso.vinculado':
      return suscriptor.tipo === 'equipo' && suscriptor.usuarioId === texto(payload, 'creadoPor')
        ? { evento: aviso.tipo, datos }
        : null;

    case 'asistencia.registrada':
      return isEquipo(suscriptor, [...PUERTA, 'financiador'])
        ? { evento: aviso.tipo, datos }
        : null;

    // El registrador ve solo los avisos *No fui yo* (API §4.7).
    case 'alerta.creada':
    case 'alerta.actualizada':
      return isEquipo(suscriptor, ORGANIZADORES) ||
        (isEquipo(suscriptor, ['registrador']) && texto(payload, 'tipo') === 'no_fui_yo')
        ? { evento: aviso.tipo, datos }
        : null;

    case 'lote.anclado':
    case 'lote.rechazado':
      return isEquipo(suscriptor, TODO_EL_EVENTO) ? { evento: aviso.tipo, datos } : null;

    case 'dispositivo.anulado':
      return suscriptor.tipo === 'asistente' &&
        suscriptor.dispositivoId === texto(payload, 'dispositivoId')
        ? { evento: aviso.tipo, datos, cerrar: true }
        : null;

    case 'foto.revisada':
      return suscriptor.tipo === 'asistente' &&
        suscriptor.asistenteId === texto(payload, 'asistenteId')
        ? { evento: aviso.tipo, datos }
        : null;

    // Lo del evento entero: a todos los canales.
    case 'evento.abierto':
    case 'evento.pausado':
    case 'evento.reanudado':
    case 'evento.cerrado':
    case 'aviso.publicado':
      return { evento: aviso.tipo, datos };

    default:
      return null;
  }
}
