import { eq } from 'drizzle-orm';
import { movimientos, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { LibroService, MovimientoCreado } from '@pasitos/libro';

/**
 * **La única forma de anular un movimiento** (HU-317 §1): crea la `anulacion` que lo compensa.
 * La usan anular un canje (HU-317), deshacer el check-in (HU-301), la verificación del carnet
 * (HU-321) y las fotos (HU-323). Un movimiento se anula una sola vez (índice único): la segunda
 * responde `YA_ANULADO`.
 */
export class AnulacionesService {
  constructor(private readonly libro: LibroService) {}

  async cancelMovimiento(
    tx: Tx,
    datos: { movimientoId: string; autorId: string; motivo: string },
  ): Promise<MovimientoCreado> {
    const [original] = await tx
      .select({
        id: movimientos.id,
        eventoId: movimientos.eventoId,
        asistenteId: movimientos.asistenteId,
        tipo: movimientos.tipo,
        puntos: movimientos.puntos,
      })
      .from(movimientos)
      .where(eq(movimientos.id, datos.movimientoId));
    if (!original) throw new AppError('NO_ENCONTRADO');
    if (original.tipo === 'anulacion') {
      throw new AppError('VALIDACION', { detail: 'Una anulación no se anula.' });
    }
    const [yaAnulado] = await tx
      .select({ id: movimientos.id })
      .from(movimientos)
      .where(eq(movimientos.anulaMovimientoId, original.id));
    if (yaAnulado) throw new AppError('YA_ANULADO');
    return this.libro.addMovimiento(tx, {
      eventoId: original.eventoId,
      asistenteId: original.asistenteId,
      tipo: 'anulacion',
      origen: 'equipo',
      puntos: -original.puntos,
      anulaMovimientoId: original.id,
      autorId: datos.autorId,
      motivo: datos.motivo,
    });
  }
}
