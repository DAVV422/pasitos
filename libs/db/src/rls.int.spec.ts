import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { withOrganizacion } from './cliente';
import { eventos, organizaciones } from './esquema';
import { startBaseDePrueba, type BaseDePrueba } from './pruebas/base-de-prueba';

/**
 * Aislamiento entre organizaciones (D47, prueba V24).
 * Requiere Docker (Testcontainers).
 */
describe('aislamiento entre organizaciones (RLS)', () => {
  let base: BaseDePrueba;
  const organizacionA = uuidv7();
  const organizacionB = uuidv7();
  const eventoA = uuidv7();
  const eventoB = uuidv7();

  beforeAll(async () => {
    base = await startBaseDePrueba();
    const ahora = new Date();
    const despues = new Date(ahora.getTime() + 3_600_000);
    await base.sistema.db.insert(organizaciones).values([
      { id: organizacionA, nombre: 'A', slug: 'org-a' },
      { id: organizacionB, nombre: 'B', slug: 'org-b' },
    ]);
    await base.sistema.db.insert(eventos).values([
      {
        id: eventoA,
        organizacionId: organizacionA,
        slug: 'evento-a',
        nombre: 'Evento A',
        inicioAt: ahora,
        finAt: despues,
      },
      {
        id: eventoB,
        organizacionId: organizacionB,
        slug: 'evento-b',
        nombre: 'Evento B',
        inicioAt: ahora,
        finAt: despues,
      },
    ]);
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('toda tabla con organizacion_id tiene RLS activada, forzada y con su política', async () => {
    const resultado = await base.owner.db.execute<{
      tabla: string;
      rls: boolean;
      forzada: boolean;
      politicas: number;
    }>(sql`
      select c.relname as tabla,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as forzada,
             (select count(*)::int from pg_policies p
               where p.tablename = c.relname and p.policyname = 'aislamiento_organizacion') as politicas
      from information_schema.columns col
      join pg_class c on c.relname = col.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = col.table_schema
      where col.table_schema = 'public' and col.column_name = 'organizacion_id' and c.relkind = 'r'
    `);
    const tablas = resultado.rows;
    expect(tablas.length).toBeGreaterThan(0);
    for (const tabla of tablas) {
      expect({
        tabla: tabla.tabla,
        rls: tabla.rls,
        forzada: tabla.forzada,
        politicas: tabla.politicas,
      }).toEqual({
        tabla: tabla.tabla,
        rls: true,
        forzada: true,
        politicas: 1,
      });
    }
  });

  it('sin organización definida, pasitos_app no ve ninguna fila', async () => {
    const filas = await base.app.db.select().from(eventos);
    expect(filas).toHaveLength(0);
  });

  it('con la organización A, solo se ven las filas de A', async () => {
    const filas = await withOrganizacion(base.app.db, organizacionA, (tx) =>
      tx.select().from(eventos),
    );
    expect(filas.map((fila) => fila.id)).toEqual([eventoA]);
  });

  it('con la organización A, no se puede modificar una fila de B', async () => {
    const actualizadas = await withOrganizacion(base.app.db, organizacionA, (tx) =>
      tx.update(eventos).set({ nombre: 'Tomado' }).where(eq(eventos.id, eventoB)).returning(),
    );
    expect(actualizadas).toHaveLength(0);
  });

  it('con la organización A, no se puede insertar una fila de B', async () => {
    const insertar = withOrganizacion(base.app.db, organizacionA, (tx) =>
      tx.insert(eventos).values({
        id: uuidv7(),
        organizacionId: organizacionB,
        slug: 'intruso',
        nombre: 'Intruso',
        inicioAt: new Date(),
        finAt: new Date(Date.now() + 3_600_000),
      }),
    );
    await expect(insertar).rejects.toThrow();
  });

  it('el valor de la organización no queda puesto en la conexión después de la transacción', async () => {
    await withOrganizacion(base.app.db, organizacionA, async () => undefined);
    const filas = await base.app.db.select().from(eventos);
    expect(filas).toHaveLength(0);
  });

  it('pasitos_sistema ve las filas de todas las organizaciones', async () => {
    const filas = await base.sistema.db.select().from(eventos);
    expect(filas.length).toBe(2);
  });

  it('withOrganizacion rechaza un id que no es UUID', async () => {
    await expect(
      withOrganizacion(base.app.db, "x' or 1=1 --", async () => undefined),
    ).rejects.toThrow('organizacionId inválido');
  });
});
