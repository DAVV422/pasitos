// Aplica las migraciones con pasitos_owner, dentro del contenedor del API (que trae drizzle y pg).
// Uso: docker compose run --rm api node migrar.mjs
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: new URL('./migraciones', import.meta.url).pathname,
  });
  console.log('Migraciones aplicadas.');
} finally {
  await pool.end();
}
