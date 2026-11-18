import { uuidv7 } from 'uuidv7';
import type { Tx } from '@pasitos/db';
import {
  AppError,
  isSignoValido,
  isTipoGanancia,
  validateMovimiento,
  type CodigoError,
  type OrigenMovimiento,
  type TipoMovimiento,
} from '@pasitos/dominio';
import { LibroRepository, type FilaMovimiento } from './libro.repository';

/** Lo que pide quien mueve puntos. Validar el QR y las firmas es de quien llama (fase 3). */
export interface NuevoMovimiento {
  readonly eventoId: string;
  readonly asistenteId: string;
  readonly tipo: TipoMovimiento;
  readonly origen: OrigenMovimiento;
  /** Obligatorio salvo en `reto`: ahí los puntos son los del reto en ese momento. */
  readonly puntos?: number;
  readonly retoId?: string;
  readonly canjeId?: string;
  readonly pantallaId?: string;
  readonly anulaMovimientoId?: string;
  readonly qr?: Readonly<Record<string, unknown>>;
  readonly firmaDispositivo?: Uint8Array;
  readonly autorId?: string;
  readonly motivo?: string;
}

export interface MovimientoCreado {
  readonly movimiento: FilaMovimiento;
  /** El saldo que confirma el servidor, después del movimiento. */
  readonly saldo: number;
}

const LIMITE_HISTORIAL = 100;

/**
 * El libro de movimientos (HU-101): la única forma de mover puntos.
 * Lo usan el API y el trabajador, con las mismas reglas.
 */
export class LibroService {
  constructor(private readonly repositorio: LibroRepository = new LibroRepository()) {}

  /**
   * Agrega un movimiento dentro de la transacción de quien llama; nunca abre una propia.
   * Orden de bloqueo fijo (Modelo §12): saldo del asistente y después el reto.
   */
  async addMovimiento(tx: Tx, nuevo: NuevoMovimiento): Promise<MovimientoCreado> {
    try {
      return await this.addMovimientoSinTraducir(tx, nuevo);
    } catch (error) {
      throw translateErrorDeBase(error) ?? error;
    }
  }

  async getSaldo(tx: Tx, asistenteId: string): Promise<number> {
    const saldo = await this.repositorio.getSaldo(tx, asistenteId);
    if (saldo === null) {
      throw new AppError('NO_ENCONTRADO');
    }
    return saldo;
  }

  /** El saldo reconstruido sumando el libro. Para la conciliación nocturna y los tests. */
  rebuildSaldo(tx: Tx, asistenteId: string): Promise<number> {
    return this.repositorio.sumMovimientos(tx, asistenteId);
  }

  listMovimientos(
    tx: Tx,
    asistenteId: string,
    opciones: { limite?: number; cursor?: string } = {},
  ): Promise<FilaMovimiento[]> {
    const limite = Math.min(Math.max(opciones.limite ?? 50, 1), LIMITE_HISTORIAL);
    return this.repositorio.listMovimientos(tx, asistenteId, limite, opciones.cursor);
  }

  private async addMovimientoSinTraducir(
    tx: Tx,
    nuevo: NuevoMovimiento,
  ): Promise<MovimientoCreado> {
    const saldo = await this.repositorio.lockSaldo(tx, nuevo.asistenteId);
    if (!saldo || saldo.eventoId !== nuevo.eventoId) {
      throw new AppError('NO_ENCONTRADO');
    }

    let puntos = nuevo.puntos;
    let contextoReto;
    if (nuevo.tipo === 'reto') {
      if (!nuevo.retoId) {
        throw new Error('Un movimiento de reto necesita retoId');
      }
      const reto = await this.repositorio.lockReto(tx, nuevo.retoId);
      if (!reto || reto.eventoId !== nuevo.eventoId) {
        throw new AppError('NO_ENCONTRADO');
      }
      puntos = reto.puntos;
      contextoReto = {
        activo: reto.estado === 'activo',
        topeTotal: reto.topeTotal,
        entregados: reto.entregados,
        vecesPorPersona: reto.vecesPorPersona,
        completadas: await this.repositorio.countParticipaciones(
          tx,
          nuevo.retoId,
          nuevo.asistenteId,
        ),
      };
    }

    if (puntos === undefined || !isSignoValido(nuevo.tipo, puntos)) {
      throw new Error(`Puntos inválidos para un movimiento de tipo ${nuevo.tipo}: ${puntos}`);
    }

    const topePuntosPersona = isTipoGanancia(nuevo.tipo)
      ? await this.repositorio.getTopePuntosPersona(tx, nuevo.eventoId)
      : null;
    const ganadosPersona =
      topePuntosPersona === null ? 0 : await this.repositorio.sumGanados(tx, nuevo.asistenteId);

    const codigo = validateMovimiento(
      { tipo: nuevo.tipo, puntos },
      {
        saldo: saldo.puntos,
        ganadosPersona,
        topePuntosPersona,
        ...(contextoReto ? { reto: contextoReto } : {}),
      },
    );
    if (codigo) {
      throw new AppError(codigo);
    }

    const movimiento = await this.repositorio.insertMovimiento(tx, {
      id: uuidv7(),
      organizacionId: saldo.organizacionId,
      eventoId: nuevo.eventoId,
      asistenteId: nuevo.asistenteId,
      tipo: nuevo.tipo,
      puntos,
      origen: nuevo.origen,
      retoId: nuevo.retoId ?? null,
      canjeId: nuevo.canjeId ?? null,
      pantallaId: nuevo.pantallaId ?? null,
      anulaMovimientoId: nuevo.anulaMovimientoId ?? null,
      qr: nuevo.qr ?? null,
      firmaDispositivo: nuevo.firmaDispositivo ? Buffer.from(nuevo.firmaDispositivo) : null,
      autorId: nuevo.autorId ?? null,
      motivo: nuevo.motivo ?? null,
    });

    if (nuevo.tipo === 'reto' && nuevo.retoId && contextoReto) {
      await this.repositorio.insertParticipacion(tx, {
        id: uuidv7(),
        organizacionId: saldo.organizacionId,
        eventoId: nuevo.eventoId,
        retoId: nuevo.retoId,
        asistenteId: nuevo.asistenteId,
        numero: contextoReto.completadas + 1,
        movimientoId: movimiento.id,
      });
      await this.repositorio.incrementEntregados(tx, nuevo.retoId);
    }

    const saldoNuevo = await this.repositorio.addSaldo(tx, nuevo.asistenteId, puntos);

    await this.repositorio.insertOutbox(tx, {
      id: uuidv7(),
      tipo: 'movimiento.creado',
      eventoId: nuevo.eventoId,
      payload: {
        eventoId: nuevo.eventoId,
        asistenteId: nuevo.asistenteId,
        movimientoId: movimiento.id,
        saldo: saldoNuevo,
      },
    });

    return { movimiento, saldo: saldoNuevo };
  }
}

/** Restricciones de la base → el mismo código que daría la regla (la base es la última defensa). */
const RESTRICCIONES: Readonly<Record<string, CodigoError>> = {
  participaciones_unica: 'RETO_YA_COMPLETADO',
  saldos_no_negativo: 'SALDO_INSUFICIENTE',
  retos_entregados: 'TOPE_ALCANZADO',
  movimientos_anula_unica: 'YA_ANULADO',
};

function translateErrorDeBase(error: unknown): AppError | null {
  const pg = findErrorPg(error);
  if (!pg?.constraint) {
    return null;
  }
  const codigo = RESTRICCIONES[pg.constraint];
  return codigo ? new AppError(codigo) : null;
}

/** Drizzle envuelve el error de `pg` en `cause`. */
function findErrorPg(error: unknown): { code?: string; constraint?: string } | null {
  let actual: unknown = error;
  for (let i = 0; i < 3 && actual && typeof actual === 'object'; i++) {
    if ('constraint' in actual && typeof actual.constraint === 'string') {
      return actual as { constraint: string };
    }
    actual = 'cause' in actual ? actual.cause : undefined;
  }
  return null;
}
