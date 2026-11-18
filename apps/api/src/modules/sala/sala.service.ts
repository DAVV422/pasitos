import { and, eq, inArray } from 'drizzle-orm';
import {
  eventos,
  lugares,
  pantallas,
  qrEmitidos,
  qrRegistro,
  retos,
  withOrganizacion,
  type Db,
} from '@pasitos/db';
import {
  AppError,
  listRetosElegibles,
  pickRetoDePantalla,
  type EstadoSala,
} from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../auth/sesiones.service';
import type { TerminalConectada } from '../terminales/conexion.service';

/** `GET /sala/estado` (HU-314 §2): todo lo que la tablet necesita para armar su QR. */
export interface EstadoSalaApi {
  readonly pantalla: {
    readonly id: string;
    readonly numero: number;
    readonly nombre: string;
    readonly lugar: string | null;
  };
  readonly estado: EstadoSala;
  readonly reto: {
    readonly id: string;
    readonly numero: number;
    readonly nombre: string;
    readonly puntos: number;
    readonly modo: string;
    readonly rotacionSegundos: number;
    readonly entregados: number;
    readonly tope: number;
  } | null;
  readonly proximo: { readonly nombre: string; readonly desde: string } | null;
  readonly epoca: number;
  /** Para que la tablet calcule la franja con la hora del servidor. */
  readonly horaServidor: number;
  readonly evento: { readonly estado: string; readonly nombre: string };
  /**
   * HU-319: con un QR de registro asignado, la tablet muestra ese QR en vez del de los retos (la
   * franja la pide aparte, a `/sala/registro/franja`).
   */
  readonly modo: 'reto' | 'registro';
  readonly registro: { readonly nombre: string; readonly registros: number } | null;
  /** HU-315: los retos que se pueden elegir con *Cambiar de reto*. */
  readonly opciones: readonly { readonly id: string; readonly nombre: string }[];
  /** Si el operador fijó un reto (si no, sigue la agenda). */
  readonly fijado: boolean;
}

export interface QrEmitido {
  readonly reto: string;
  readonly modo: 'por_tiempo' | 'un_uso';
  readonly epoca: number;
  readonly franja?: number | undefined;
  readonly nonce?: string | undefined;
  readonly inicioAt: string;
  readonly finAt?: string | undefined;
  readonly finMotivo?: 'vencio' | 'usado' | 'invalidado' | 'pausa' | undefined;
}

/** La pantalla de sala (HU-314): qué reto muestra y qué QR mostró. */
export class SalaService {
  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  getEstado(terminal: TerminalConectada): Promise<EstadoSalaApi> {
    if (terminal.tipo !== 'pantalla') throw new AppError('TERMINAL_DESCONECTADA');
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const [pantalla] = await tx
        .select({
          id: pantallas.id,
          numero: pantallas.numero,
          nombre: pantallas.nombre,
          estado: pantallas.estado,
          epoca: pantallas.epoca,
          lugarId: pantallas.lugarId,
          retoFijadoId: pantallas.retoActualId,
          lugar: lugares.nombre,
          eventoEstado: eventos.estado,
          eventoNombre: eventos.nombre,
        })
        .from(pantallas)
        .innerJoin(eventos, eq(eventos.id, pantallas.eventoId))
        .leftJoin(lugares, eq(lugares.id, pantallas.lugarId))
        .where(eq(pantallas.id, terminal.id));
      if (!pantalla) throw new AppError('TERMINAL_DESCONECTADA');
      const filas = await tx
        .select({
          id: retos.id,
          numero: retos.numero,
          nombre: retos.nombre,
          puntos: retos.puntos,
          lugarId: retos.lugarId,
          tipo: retos.tipo,
          estado: retos.estado,
          modoQr: retos.modoQr,
          rotacionSegundos: retos.rotacionSegundos,
          disponibleDesde: retos.disponibleDesde,
          disponibleHasta: retos.disponibleHasta,
          entregados: retos.entregados,
          topeTotal: retos.topeTotal,
        })
        .from(retos)
        .where(and(eq(retos.eventoId, terminal.evento.id), eq(retos.tipo, 'qr')));
      const [registro] = await tx
        .select({ nombre: qrRegistro.nombre, registros: qrRegistro.registros })
        .from(qrRegistro)
        .where(and(eq(qrRegistro.pantallaId, pantalla.id), eq(qrRegistro.estado, 'activo')));
      const ahora = this.reloj.now();
      const elegido = pickRetoDePantalla(pantalla, filas, { estado: pantalla.eventoEstado }, ahora);
      const reto = elegido.reto;
      return {
        pantalla: {
          id: pantalla.id,
          numero: pantalla.numero,
          nombre: pantalla.nombre,
          lugar: pantalla.lugar,
        },
        estado: elegido.estado,
        reto: reto
          ? {
              id: reto.id,
              numero: reto.numero,
              nombre: reto.nombre,
              puntos: reto.puntos,
              modo: reto.modoQr,
              rotacionSegundos: reto.rotacionSegundos,
              entregados: reto.entregados,
              tope: reto.topeTotal,
            }
          : null,
        proximo: elegido.proximo?.disponibleDesde
          ? {
              nombre: elegido.proximo.nombre,
              desde: elegido.proximo.disponibleDesde.toISOString(),
            }
          : null,
        epoca: pantalla.epoca,
        horaServidor: ahora.getTime(),
        evento: { estado: pantalla.eventoEstado, nombre: pantalla.eventoNombre },
        modo: registro ? 'registro' : 'reto',
        registro: registro ?? null,
        opciones: listRetosElegibles(filas, pantalla.lugarId, ahora).map((r) => ({
          id: r.id,
          nombre: r.nombre,
        })),
        fijado: pantalla.retoFijadoId !== null,
      };
    });
  }

  /**
   * Lo que mostró la tablet, en tandas (HU-314 §3.6). Los retos tienen que ser del evento de la
   * pantalla; lo demás se descarta.
   */
  recordEmitidos(
    terminal: TerminalConectada,
    items: readonly QrEmitido[],
  ): Promise<{ guardados: number }> {
    if (terminal.tipo !== 'pantalla') throw new AppError('TERMINAL_DESCONECTADA');
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const ids = [...new Set(items.map((i) => i.reto))];
      const validos = new Set(
        ids.length === 0
          ? []
          : (
              await tx
                .select({ id: retos.id })
                .from(retos)
                .where(and(eq(retos.eventoId, terminal.evento.id), inArray(retos.id, ids)))
            ).map((r) => r.id),
      );
      const filas = items
        .filter((i) => validos.has(i.reto))
        .map((i) => ({
          id: uuidv7(),
          organizacionId: terminal.organizacionId,
          eventoId: terminal.evento.id,
          pantallaId: terminal.id,
          retoId: i.reto,
          modo: i.modo,
          epoca: i.epoca,
          franja: i.modo === 'por_tiempo' ? (i.franja ?? null) : null,
          nonce: i.modo === 'un_uso' ? (i.nonce ?? null) : null,
          inicioAt: new Date(i.inicioAt),
          finAt: i.finAt ? new Date(i.finAt) : null,
          finMotivo: i.finMotivo ?? null,
        }))
        .filter((f) => (f.franja === null) !== (f.nonce === null));
      if (filas.length > 0) await tx.insert(qrEmitidos).values(filas);
      return { guardados: filas.length };
    });
  }
}
