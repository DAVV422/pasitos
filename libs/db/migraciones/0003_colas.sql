-- Colas de pg-boss (HU-103). El trabajador (pasitos_sistema) crea y migra su propio esquema `pgboss`
-- al arrancar, y para eso necesita poder crear esquemas en esta base. No toca el esquema public.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO pasitos_sistema', current_database());
END
$$;
