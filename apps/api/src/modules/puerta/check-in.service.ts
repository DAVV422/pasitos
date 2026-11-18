import { and, eq, isNull } from 'drizzle-orm';
import { asistentes, checkIns, eventos, movimientos, outbox, usuarios, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';
import type { AnulacionesService } from '../movimientos/anulaciones.service';

export const METODOS_CHECK_IN = [
  'escaneo_entrada',
  'busqueda',
  'registro_puerta',
  'vinculacion_puerta',
  'autoregistro_equipo',
  'autoregistro_tablet',
  'autoregistro_impreso',
] as const;
export type MetodoCheckIn = (typeof METODOS_CHECK_IN)[number];

/** *"Luis C."*: lo que ve la puerta de quién marcó (sin el apellido completo). */
export function getNombreCorto(nombre: string | null): string | null {
  if (!nombre) return null;
  const [primero, segundo] = nombre.trim().split(/\s+/);
  return segundo ? `${primero} ${segundo.charAt(0).toUpperCase()}.` : (primero ?? null);
}

export interface DatosCheckIn {
  readonly organizacionId: string;
  readonly eventoId: string;
  readonly asistenteId: string;
  readonly metodo: MetodoCheckIn;
  readonly actor: ActorBitacora;
  readonly registradorId?: string | null;
  readonly qrRegistroId?: string | null;
}

export interface CheckInHecho {
  readonly checkInId: string;
  readonly at: string;
  readonly puntos: number;
  readonly saldo: number;
}

/**
 * Hacer y deshacer el check-in (HU-301 §3 y §4). Corre dentro de la transacción de quien llama:
 * lo reutilizan la puerta, el QR de asistente (HU-302), el registro en la puerta (HU-303) y el
 * autorregistro (HU-320).
 */
export class CheckInService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly libro: LibroService,
    private readonly anulaciones: AnulacionesService,
  ) {}

  async register(tx: Tx, datos: DatosCheckIn): Promise<CheckInHecho> {
    // La fila del asistente bloqueada: dos registradores a la vez no duplican.
    const [asistente] = await tx
      .select({ id: asistentes.id, nombre: asistentes.nombre, estado: asistentes.estado })
      .from(asistentes)
      .where(and(eq(asistentes.id, datos.asistenteId), eq(asistentes.eventoId, datos.eventoId)))
      .for('update');
    if (!asistente) {
      throw new AppError('NO_ENCONTRADO');
    }
    const activo = await this.findActivo(tx, datos.asistenteId);
    if (activo) {
      throw new AppError('CHECK_IN_YA_HECHO', {
        meta: { por: getNombreCorto(activo.por), at: activo.at.toISOString() },
      });
    }
    if (asistente.estado === 'cancelado') {
      throw new AppError('ASISTENTE_CANCELADO');
    }
    const [evento] = await tx
      .select({ estado: eventos.estado, puntosCheckIn: eventos.puntosCheckIn })
      .from(eventos)
      .where(eq(eventos.id, datos.eventoId));
    // Se puede antes de abrir, por las filas de la mañana.
    if (!evento || (evento.estado !== 'publicado' && evento.estado !== 'en_curso')) {
      throw new AppError(
        'EVENTO_NO_ACTIVO',
        evento?.estado === 'borrador'
          ? { detail: 'Publica el evento para marcar la asistencia.' }
          : {},
      );
    }

    const autorregistro = datos.metodo.startsWith('autoregistro');
    const { movimiento, saldo } = await this.libro.addMovimiento(tx, {
      eventoId: datos.eventoId,
      asistenteId: datos.asistenteId,
      tipo: 'checkin',
      origen: autorregistro ? 'sistema' : 'equipo',
      puntos: evento.puntosCheckIn,
      ...(datos.registradorId ? { autorId: datos.registradorId } : {}),
    });
    const checkInId = uuidv7();
    await tx.insert(checkIns).values({
      id: checkInId,
      organizacionId: datos.organizacionId,
      eventoId: datos.eventoId,
      asistenteId: datos.asistenteId,
      metodo: datos.metodo,
      registradorId: datos.registradorId ?? null,
      qrRegistroId: datos.qrRegistroId ?? null,
      movimientoId: movimiento.id,
      createdAt: movimiento.createdAt,
    });
    await tx
      .update(asistentes)
      .set({ estado: 'presente', updatedAt: movimiento.createdAt })
      .where(eq(asistentes.id, datos.asistenteId));
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'asistencia.registrada',
      eventoId: datos.eventoId,
      payload: { eventoId: datos.eventoId, asistenteId: datos.asistenteId, metodo: datos.metodo },
    });
    await this.bitacora.record(tx, {
      actor: datos.actor,
      accion: 'asistente.check_in',
      organizacionId: datos.organizacionId,
      eventoId: datos.eventoId,
      objeto: { tipo: 'asistente', id: asistente.id, nombre: asistente.nombre },
      despues: { metodo: datos.metodo, puntos: evento.puntosCheckIn },
    });
    return {
      checkInId,
      at: movimiento.createdAt.toISOString(),
      puntos: evento.puntosCheckIn,
      saldo,
    };
  }

  /**
   * Deshacer (HU-301 §4): resta la bienvenida con una anulación y la persona vuelve a
   * *registrado*. Si ya gastó la bienvenida, el libro responde `SALDO_INSUFICIENTE`.
   */
  async undo(
    tx: Tx,
    datos: {
      organizacionId: string;
      eventoId: string;
      asistenteId: string;
      motivo: string;
      autorId: string;
      actor: ActorBitacora;
      ahora: Date;
    },
  ): Promise<{ saldo: number }> {
    const [asistente] = await tx
      .select({ id: asistentes.id, nombre: asistentes.nombre })
      .from(asistentes)
      .where(and(eq(asistentes.id, datos.asistenteId), eq(asistentes.eventoId, datos.eventoId)))
      .for('update');
    const activo = asistente ? await this.findActivo(tx, datos.asistenteId) : null;
    if (!asistente || !activo) {
      throw new AppError('NO_ENCONTRADO');
    }
    let saldo: number;
    let anulacionId: string | null = null;
    if (activo.puntos > 0) {
      try {
        // HU-317: la única forma de anular un movimiento.
        const anulacion = await this.anulaciones.cancelMovimiento(tx, {
          movimientoId: activo.movimientoId,
          autorId: datos.autorId,
          motivo: datos.motivo,
        });
        saldo = anulacion.saldo;
        anulacionId = anulacion.movimiento.id;
      } catch (error) {
        if (error instanceof AppError && error.code === 'SALDO_INSUFICIENTE') {
          throw new AppError('SALDO_INSUFICIENTE', {
            detail: 'Ya gastó los puntos de bienvenida. Anula primero su canje.',
          });
        }
        throw error;
      }
    } else {
      saldo = await this.libro.getSaldo(tx, datos.asistenteId);
    }
    await tx
      .update(checkIns)
      .set({
        anuladoAt: datos.ahora,
        anuladoPor: datos.autorId,
        motivoAnulacion: datos.motivo,
        movimientoAnulacionId: anulacionId,
      })
      .where(eq(checkIns.id, activo.id));
    await tx
      .update(asistentes)
      .set({ estado: 'registrado', updatedAt: datos.ahora })
      .where(eq(asistentes.id, datos.asistenteId));
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'asistencia.anulada',
      eventoId: datos.eventoId,
      payload: { eventoId: datos.eventoId, asistenteId: datos.asistenteId },
    });
    await this.bitacora.record(tx, {
      actor: datos.actor,
      accion: 'asistente.check_in_anular',
      organizacionId: datos.organizacionId,
      eventoId: datos.eventoId,
      objeto: { tipo: 'asistente', id: asistente.id, nombre: asistente.nombre },
      antes: { estado: 'presente' },
      despues: { estado: 'registrado', motivo: datos.motivo },
    });
    return { saldo };
  }

  /** El check-in activo, con quién lo hizo y los puntos que dio. */
  async findActivo(tx: Tx, asistenteId: string) {
    const [fila] = await tx
      .select({
        id: checkIns.id,
        at: checkIns.createdAt,
        metodo: checkIns.metodo,
        movimientoId: checkIns.movimientoId,
        puntos: movimientos.puntos,
        por: usuarios.nombre,
      })
      .from(checkIns)
      .innerJoin(movimientos, eq(movimientos.id, checkIns.movimientoId))
      .leftJoin(usuarios, eq(usuarios.id, checkIns.registradorId))
      .where(and(eq(checkIns.asistenteId, asistenteId), isNull(checkIns.anuladoAt)));
    return fila ?? null;
  }
}
