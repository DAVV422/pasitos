#!/bin/sh
# Pasitos · arranque de PostgreSQL (T-003 §1).
# Corre una sola vez, al crear el volumen. Crea la base, las extensiones y los roles.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE pasitos_owner   LOGIN PASSWORD '${PASITOS_OWNER_PASSWORD}';
CREATE ROLE pasitos_app     LOGIN PASSWORD '${PASITOS_APP_PASSWORD}';
CREATE ROLE pasitos_sistema LOGIN PASSWORD '${PASITOS_SISTEMA_PASSWORD}' BYPASSRLS;
CREATE ROLE pasitos_copias  LOGIN PASSWORD '${PASITOS_COPIAS_PASSWORD}' BYPASSRLS;
GRANT pg_read_all_data TO pasitos_copias;
CREATE DATABASE pasitos OWNER pasitos_owner;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname pasitos <<SQL
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO pasitos_owner;
GRANT USAGE ON SCHEMA public TO pasitos_app, pasitos_sistema, pasitos_copias;

-- Las tablas las crea pasitos_owner con las migraciones; los demás roles reciben permisos solos.
ALTER DEFAULT PRIVILEGES FOR ROLE pasitos_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pasitos_app, pasitos_sistema;
ALTER DEFAULT PRIVILEGES FOR ROLE pasitos_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pasitos_app, pasitos_sistema;
SQL
