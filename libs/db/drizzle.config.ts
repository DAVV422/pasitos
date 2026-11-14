import { defineConfig } from 'drizzle-kit';

/** Generación de migraciones: `pnpm db:generar`. Se aplican con `pnpm db:migrar` (rol pasitos_owner). */
export default defineConfig({
  dialect: 'postgresql',
  schema: './libs/db/src/esquema/index.ts',
  out: './libs/db/migraciones',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env['DATABASE_URL_OWNER'] ?? '',
  },
});
