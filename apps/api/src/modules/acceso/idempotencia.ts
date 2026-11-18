import { createHash } from 'node:crypto';
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

const UUID_CLAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La clave de una operación del equipo que mueve puntos (check-in, anular): sin firma de
 * dispositivo, pero con `Idempotency-Key` y el hash del cuerpo tal como llegó.
 */
export function getPedidoIdempotente(request: {
  headers: Record<string, string | string[] | undefined>;
  url: string;
  rawBody?: Buffer;
}): Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'> {
  const valor = request.headers['idempotency-key'];
  const clave = Array.isArray(valor) ? valor[0] : valor;
  if (!clave || !UUID_CLAVE.test(clave)) {
    throw new AppError('VALIDACION', {
      errors: [
        { field: 'Idempotency-Key', code: 'REQUERIDO', message: 'Falta la clave de la operación.' },
      ],
    });
  }
  return {
    clave,
    hashCuerpo: createHash('sha256')
      .update(request.rawBody ?? Buffer.alloc(0))
      .digest('base64url'),
    ruta: request.url.split('?')[0] ?? request.url,
  };
}
