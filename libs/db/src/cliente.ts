import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as esquema from './esquema';
import { VARIABLE_ORGANIZACION } from './rls';

export type Db = NodePgDatabase<typeof esquema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ConexionDb {
  readonly db: Db;
  readonly pool: Pool;
}

/**
 * Crea un pool y su cliente de Drizzle para un rol de la base.
 *
 * `alErrorInactivo` recibe los errores de conexiones en reposo (por ejemplo, si la base se
 * reinicia). Sin este manejador, `pg` emite un evento 'error' sin escuchar y el proceso se cae.
 */
export function createConexion(
  url: string,
  opciones: PoolConfig = {},
  alErrorInactivo: (error: Error) => void = () => undefined,
): ConexionDb {
  const pool = new Pool({ connectionString: url, max: 20, ...opciones });
  pool.on('error', alErrorInactivo);
  return { db: drizzle(pool, { schema: esquema }), pool };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Abre una transacción con la organización fijada (D47).
 * El valor vive solo dentro de la transacción (`set_config(..., true)`),
 * así no se mezcla entre requests aunque se reutilice la conexión.
 * Usar con el pool del rol `pasitos_app`.
 */
export async function withOrganizacion<T>(
  db: Db,
  organizacionId: string,
  trabajo: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID.test(organizacionId)) {
    throw new Error('organizacionId inválido');
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${VARIABLE_ORGANIZACION}, ${organizacionId}, true)`);
    return trabajo(tx);
  });
}
