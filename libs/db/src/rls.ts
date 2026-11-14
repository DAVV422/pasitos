/**
 * Aislamiento entre organizaciones con Row Level Security (D47).
 * Modelo de datos §0.1 · T-003 §3.
 *
 * Toda tabla con `organizacion_id` debe tener RLS. El test de aislamiento
 * (rls.int.spec.ts) recorre la base y falla si alguna no la tiene.
 */

/** Variable de la sesión de PostgreSQL que fija la organización de la transacción. */
export const VARIABLE_ORGANIZACION = 'app.organizacion_id';

/** SQL que activa y fuerza RLS en una tabla, con la política de aislamiento. */
export function buildSqlRls(tabla: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(tabla)) {
    throw new Error(`Nombre de tabla inválido: ${tabla}`);
  }
  const condicion = `organizacion_id = nullif(current_setting('${VARIABLE_ORGANIZACION}', true), '')::uuid`;
  return [
    `ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE "${tabla}" FORCE ROW LEVEL SECURITY;`,
    `CREATE POLICY aislamiento_organizacion ON "${tabla}" USING (${condicion}) WITH CHECK (${condicion});`,
  ].join('\n');
}

/** SQL que vuelve una tabla de solo agregar (libro de movimientos, bitácora). */
export function buildSqlSoloAgregar(tabla: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(tabla)) {
    throw new Error(`Nombre de tabla inválido: ${tabla}`);
  }
  return [
    `CREATE TRIGGER solo_agregar BEFORE UPDATE OR DELETE ON "${tabla}" FOR EACH ROW EXECUTE FUNCTION rechazar_cambios();`,
    `REVOKE UPDATE, DELETE ON "${tabla}" FROM pasitos_app, pasitos_sistema;`,
  ].join('\n');
}
