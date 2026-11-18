import { and, eq, sql } from 'drizzle-orm';
import { idempotencia, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { FirmaVerificada } from '../../common/sesion/asistente';

/**
 * La `Idempotency-Key` de las operaciones que mueven puntos (API §2.1, HU-306 §4). Corre **dentro
 * de la transacción del caso de uso**: si el caso de uso falla, la clave no queda usada y el
 * reintento vuelve a intentarlo; si salió bien, el reintento recibe la misma respuesta.
 *
 * - La misma clave con el mismo cuerpo: la respuesta guardada, sin volver a hacer nada.
 * - La misma clave con otro cuerpo u otra ruta: `IDEMPOTENCIA_CONFLICTO`.
 * - Dos pedidos a la vez con la misma clave: el segundo espera al primero (la fila está bloqueada).
 */
export async function runIdempotente<T>(
  tx: Tx,
  actor: string,
  firma: Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>,
  trabajo: () => Promise<T>,
  estadoHttp = 201,
): Promise<T> {
  const hashCuerpo = Buffer.from(firma.hashCuerpo, 'base64url');
  const nueva = await tx
    .insert(idempotencia)
    .values({ actor, clave: firma.clave, ruta: firma.ruta, hashCuerpo })
    .onConflictDoNothing()
    .returning({ clave: idempotencia.clave });
  if (nueva.length === 0) {
    const [guardada] = await tx
      .select()
      .from(idempotencia)
      .where(and(eq(idempotencia.actor, actor), eq(idempotencia.clave, firma.clave)))
      .for('update');
    if (!guardada || guardada.ruta !== firma.ruta || !guardada.hashCuerpo.equals(hashCuerpo)) {
      throw new AppError('IDEMPOTENCIA_CONFLICTO');
    }
    return guardada.respuesta as T;
  }
  const resultado = await trabajo();
  await tx
    .update(idempotencia)
    .set({ estadoHttp, respuesta: sql`${JSON.stringify(resultado ?? null)}::jsonb` })
    .where(and(eq(idempotencia.actor, actor), eq(idempotencia.clave, firma.clave)));
  return resultado;
}
