-- Aislamiento entre organizaciones (D47) y tablas de solo agregar (T-003 §3 y §4).
-- Toda tabla con organizacion_id lleva RLS forzada con esta misma política.
-- Si app.organizacion_id no está definido (NULL) o quedó vacío tras una transacción anterior,
-- nullif(...) da NULL y la consulta no devuelve nada (falla cerrada).

ALTER TABLE "miembros_organizacion" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "miembros_organizacion" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "miembros_organizacion"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "eventos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "eventos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aislamiento_organizacion ON "eventos"
  USING (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid)
  WITH CHECK (organizacion_id = nullif(current_setting('app.organizacion_id', true), '')::uuid);
--> statement-breakpoint
-- Función para las tablas de solo agregar (libro de movimientos y bitácora).
-- Se aplica con buildSqlSoloAgregar() de libs/db/src/rls.ts en la migración de cada tabla.
CREATE FUNCTION rechazar_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % solo admite agregar filas', TG_TABLE_NAME;
END
$$ LANGUAGE plpgsql;
