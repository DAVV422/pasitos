import { buildSqlRls, buildSqlSoloAgregar } from './rls';

describe('SQL de aislamiento', () => {
  it('activa, fuerza y crea la política', () => {
    const sqlRls = buildSqlRls('eventos');
    expect(sqlRls).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sqlRls).toContain('FORCE ROW LEVEL SECURITY');
    expect(sqlRls).toContain("nullif(current_setting('app.organizacion_id', true), '')::uuid");
  });

  it('rechaza nombres de tabla inválidos', () => {
    expect(() => buildSqlRls('eventos; drop table x')).toThrow();
    expect(() => buildSqlSoloAgregar('Movimientos')).toThrow();
  });
});
