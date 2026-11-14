import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createConexion, type ConexionDb } from '../cliente';

const CLAVES = {
  owner: 'owner-test',
  app: 'app-test',
  sistema: 'sistema-test',
  copias: 'copias-test',
} as const;

export interface BaseDePrueba {
  readonly contenedor: StartedPostgreSqlContainer;
  readonly owner: ConexionDb;
  readonly app: ConexionDb;
  readonly sistema: ConexionDb;
  stop(): Promise<void>;
}

/**
 * Levanta PostgreSQL 17 con el mismo script de arranque que desarrollo y producción
 * (infra/postgres/inicio.sh) y aplica todas las migraciones.
 */
export async function startBaseDePrueba(): Promise<BaseDePrueba> {
  const raiz = resolve(import.meta.dirname, '../../../..');
  const contenedor = await new PostgreSqlContainer('postgres:17')
    .withDatabase('postgres')
    .withEnvironment({
      PASITOS_OWNER_PASSWORD: CLAVES.owner,
      PASITOS_APP_PASSWORD: CLAVES.app,
      PASITOS_SISTEMA_PASSWORD: CLAVES.sistema,
      PASITOS_COPIAS_PASSWORD: CLAVES.copias,
    })
    .withCopyFilesToContainer([
      {
        source: resolve(raiz, 'infra/postgres/inicio.sh'),
        target: '/docker-entrypoint-initdb.d/inicio.sh',
        mode: 0o755,
      },
    ])
    .start();

  const url = (usuario: string, clave: string) =>
    `postgres://${usuario}:${clave}@${contenedor.getHost()}:${contenedor.getPort()}/pasitos`;

  const owner = createConexion(url('pasitos_owner', CLAVES.owner), { max: 2 });
  await migrate(owner.db, { migrationsFolder: resolve(raiz, 'libs/db/migraciones') });

  const app = createConexion(url('pasitos_app', CLAVES.app), { max: 4 });
  const sistema = createConexion(url('pasitos_sistema', CLAVES.sistema), { max: 2 });

  return {
    contenedor,
    owner,
    app,
    sistema,
    async stop() {
      await Promise.all([owner.pool.end(), app.pool.end(), sistema.pool.end()]);
      await contenedor.stop();
    },
  };
}
