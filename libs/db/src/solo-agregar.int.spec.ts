import { sql } from 'drizzle-orm';
import { buildSqlSoloAgregar } from './rls';
import { startBaseDePrueba, type BaseDePrueba } from './pruebas/base-de-prueba';

/** Tablas de solo agregar (T-003 §4). Requiere Docker. */
describe('tablas de solo agregar', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    await base.owner.db.execute(
      sql.raw('create table prueba_libro (id int primary key, valor text)'),
    );
    await base.owner.db.execute(sql.raw(buildSqlSoloAgregar('prueba_libro')));
    await base.owner.db.execute(sql.raw("insert into prueba_libro values (1, 'original')"));
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('se pueden agregar filas', async () => {
    await base.owner.db.execute(sql.raw("insert into prueba_libro values (2, 'otra')"));
    const resultado = await base.owner.db.execute(
      sql.raw('select count(*)::int as total from prueba_libro'),
    );
    expect(resultado.rows[0]).toEqual({ total: 2 });
  });

  it('rechaza UPDATE, incluso al dueño de la tabla', async () => {
    await expect(
      base.owner.db.execute(sql.raw("update prueba_libro set valor = 'cambiado' where id = 1")),
    ).rejects.toThrow();
  });

  it('rechaza DELETE, incluso al dueño de la tabla', async () => {
    await expect(
      base.owner.db.execute(sql.raw('delete from prueba_libro where id = 1')),
    ).rejects.toThrow();
  });
});
