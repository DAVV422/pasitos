import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  asistentes,
  eventos,
  movimientos,
  outbox,
  participaciones,
  retos,
  saldos,
  withOrganizacion,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { AppError } from '@pasitos/dominio';
import { buildIdAnonimo } from '@pasitos/firmas';
import { LibroService, type NuevoMovimiento } from './libro.service';
import {
  createAsistente,
  createAsistentes,
  createOrganizacionYEvento,
  createReto,
} from './pruebas/datos';

/** Libro de movimientos contra PostgreSQL real (HU-101). Requiere Docker. */
describe('libro de movimientos', () => {
  let base: BaseDePrueba;
  const libro = new LibroService();

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  /** Cada operación en su propia transacción, con la organización fijada, como el API. */
  const mover = (organizacionId: string, nuevo: NuevoMovimiento) =>
    withOrganizacion(base.app.db, organizacionId, (tx) => libro.addMovimiento(tx, nuevo));

  const codigoDe = (resultado: PromiseSettledResult<unknown>) =>
    resultado.status === 'rejected' && resultado.reason instanceof AppError
      ? resultado.reason.code
      : resultado.status;

  describe('al crear asistentes y retos', () => {
    it('cada asistente nace con saldo 0 y su id anónimo con la sal del evento', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);

      const [evento] = await base.sistema.db
        .select({ sal: eventos.salAnonima })
        .from(eventos)
        .where(eq(eventos.id, eventoId));
      const [asistente] = await base.sistema.db
        .select({ idAnonimo: asistentes.idAnonimo })
        .from(asistentes)
        .where(eq(asistentes.id, asistenteId));
      const [saldo] = await base.sistema.db
        .select({ puntos: saldos.puntos })
        .from(saldos)
        .where(eq(saldos.asistenteId, asistenteId));

      expect(evento?.sal.length).toBe(32);
      const esperado = createHash('sha256')
        .update(evento?.sal ?? Buffer.alloc(0))
        .update(asistenteId, 'utf8')
        .digest();
      expect(asistente?.idAnonimo.equals(esperado)).toBe(true);
      expect(saldo?.puntos).toBe(0);
      // libs/firmas hace el mismo cálculo que el trigger (para verificar desde afuera).
      const calculado = await buildIdAnonimo(evento?.sal ?? new Uint8Array(), asistenteId);
      expect(Buffer.from(calculado).equals(asistente?.idAnonimo ?? Buffer.alloc(0))).toBe(true);
    });

    it('el id anónimo no se puede cambiar', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      await expect(
        withOrganizacion(base.app.db, organizacionId, (tx) =>
          tx
            .update(asistentes)
            .set({ idAnonimo: Buffer.alloc(32) })
            .where(eq(asistentes.id, asistenteId)),
        ),
      ).rejects.toThrow();
    });

    it('los retos reciben números cortos seguidos por evento, que no cambian', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const primero = await createReto(base.app.db, organizacionId, eventoId);
      const segundo = await createReto(base.app.db, organizacionId, eventoId);
      expect([primero.numero, segundo.numero]).toEqual([1, 2]);

      await expect(
        withOrganizacion(base.app.db, organizacionId, (tx) =>
          tx.update(retos).set({ numero: 7 }).where(eq(retos.id, primero.id)),
        ),
      ).rejects.toThrow();
    });
  });

  describe('addMovimiento', () => {
    it('un reto suma los puntos del reto, deja la participación, el contador y el aviso', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      const reto = await createReto(base.app.db, organizacionId, eventoId, { puntos: 20 });

      const resultado = await mover(organizacionId, {
        eventoId,
        asistenteId: asistenteId,
        tipo: 'reto',
        origen: 'asistente',
        retoId: reto.id,
        puntos: 999, // Se ignora: valen los puntos del reto.
      });

      expect(resultado.saldo).toBe(20);
      expect(resultado.movimiento.puntos).toBe(20);
      const [participacion] = await base.sistema.db
        .select()
        .from(participaciones)
        .where(eq(participaciones.movimientoId, resultado.movimiento.id));
      expect(participacion?.numero).toBe(1);
      const [filaReto] = await base.sistema.db.select().from(retos).where(eq(retos.id, reto.id));
      expect(filaReto?.entregados).toBe(1);
      const avisos = await base.sistema.db
        .select()
        .from(outbox)
        .where(and(eq(outbox.tipo, 'movimiento.creado'), eq(outbox.eventoId, eventoId)));
      expect(avisos).toHaveLength(1);
    });

    it('rechaza dejar el saldo negativo sin escribir nada', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);

      await expect(
        mover(organizacionId, {
          eventoId,
          asistenteId: asistenteId,
          tipo: 'canje',
          origen: 'asistente',
          canjeId: uuidv7(),
          puntos: -10,
        }),
      ).rejects.toMatchObject({ code: 'SALDO_INSUFICIENTE' });

      const filas = await base.sistema.db
        .select()
        .from(movimientos)
        .where(eq(movimientos.asistenteId, asistenteId));
      expect(filas).toHaveLength(0);
    });

    it('aplica el tope de puntos por persona', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db, {
        topePuntosPersona: 30,
      });
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      const reto = await createReto(base.app.db, organizacionId, eventoId, {
        puntos: 20,
        vecesPorPersona: 3,
      });
      const reclamo: NuevoMovimiento = {
        eventoId,
        asistenteId: asistenteId,
        tipo: 'reto',
        origen: 'asistente',
        retoId: reto.id,
      };
      await mover(organizacionId, reclamo);
      await expect(mover(organizacionId, reclamo)).rejects.toMatchObject({
        code: 'TOPE_PUNTOS_PERSONA',
      });
    });

    it('no mueve puntos de un asistente de otro evento', async () => {
      const uno = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, uno.organizacionId, uno.eventoId);
      const otro = await createOrganizacionYEvento(base.sistema.db);

      await expect(
        mover(uno.organizacionId, {
          eventoId: otro.eventoId,
          asistenteId: asistenteId,
          tipo: 'checkin',
          origen: 'equipo',
          puntos: 10,
        }),
      ).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    });

    it('con otra organización fijada, el asistente no existe (RLS)', async () => {
      const uno = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, uno.organizacionId, uno.eventoId);
      const otra = await createOrganizacionYEvento(base.sistema.db);

      await expect(
        mover(otra.organizacionId, {
          eventoId: uno.eventoId,
          asistenteId: asistenteId,
          tipo: 'checkin',
          origen: 'equipo',
          puntos: 10,
        }),
      ).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    });
  });

  describe('concurrencia', () => {
    it('V2: 20 reclamos simultáneos del mismo reto dejan una sola participación', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      const reto = await createReto(base.app.db, organizacionId, eventoId);

      const resultados = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          mover(organizacionId, {
            eventoId,
            asistenteId: asistenteId,
            tipo: 'reto',
            origen: 'asistente',
            retoId: reto.id,
          }),
        ),
      );

      const codigos = resultados.map(codigoDe);
      expect(codigos.filter((c) => c === 'fulfilled')).toHaveLength(1);
      expect(codigos.filter((c) => c === 'RETO_YA_COMPLETADO')).toHaveLength(19);
      const filas = await base.sistema.db
        .select()
        .from(participaciones)
        .where(eq(participaciones.retoId, reto.id));
      expect(filas).toHaveLength(1);
    });

    it('50 asistentes a la vez sobre un reto con tope 10: entrega exactamente 10', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const ids = await createAsistentes(base.app.db, organizacionId, eventoId, 50);
      const reto = await createReto(base.app.db, organizacionId, eventoId, { topeTotal: 10 });

      const resultados = await Promise.allSettled(
        ids.map((asistenteId) =>
          mover(organizacionId, {
            eventoId,
            asistenteId,
            tipo: 'reto',
            origen: 'asistente',
            retoId: reto.id,
          }),
        ),
      );

      const codigos = resultados.map(codigoDe);
      expect(codigos.filter((c) => c === 'fulfilled')).toHaveLength(10);
      expect(codigos.filter((c) => c === 'TOPE_ALCANZADO')).toHaveLength(40);
      const [filaReto] = await base.sistema.db.select().from(retos).where(eq(retos.id, reto.id));
      expect(filaReto?.entregados).toBe(10);
    });

    it('dos descuentos simultáneos con saldo para uno: uno pasa y el otro no', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      await mover(organizacionId, {
        eventoId,
        asistenteId: asistenteId,
        tipo: 'checkin',
        origen: 'equipo',
        puntos: 30,
      });

      const canje = (): NuevoMovimiento => ({
        eventoId,
        asistenteId: asistenteId,
        tipo: 'canje',
        origen: 'asistente',
        canjeId: uuidv7(),
        puntos: -30,
      });
      const resultados = await Promise.allSettled([
        mover(organizacionId, canje()),
        mover(organizacionId, canje()),
      ]);

      expect(resultados.map(codigoDe).sort()).toEqual(['SALDO_INSUFICIENTE', 'fulfilled']);
      const saldo = await withOrganizacion(base.app.db, organizacionId, (tx) =>
        libro.getSaldo(tx, asistenteId),
      );
      expect(saldo).toBe(0);
    });
  });

  describe('integridad', () => {
    it('el saldo guardado siempre es la suma del libro', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      const reto = await createReto(base.app.db, organizacionId, eventoId, {
        puntos: 15,
        vecesPorPersona: 2,
      });
      const pasos: NuevoMovimiento[] = [
        { eventoId, asistenteId: asistenteId, tipo: 'checkin', origen: 'equipo', puntos: 5 },
        { eventoId, asistenteId: asistenteId, tipo: 'reto', origen: 'asistente', retoId: reto.id },
        { eventoId, asistenteId: asistenteId, tipo: 'reto', origen: 'asistente', retoId: reto.id },
        {
          eventoId,
          asistenteId: asistenteId,
          tipo: 'canje',
          origen: 'asistente',
          canjeId: uuidv7(),
          puntos: -20,
        },
        {
          eventoId,
          asistenteId: asistenteId,
          tipo: 'vencimiento',
          origen: 'sistema',
          puntos: -15,
        },
      ];
      for (const paso of pasos) {
        await mover(organizacionId, paso);
      }

      await withOrganizacion(base.app.db, organizacionId, async (tx) => {
        expect(await libro.getSaldo(tx, asistenteId)).toBe(0);
        expect(await libro.rebuildSaldo(tx, asistenteId)).toBe(0);
        const historial = await libro.listMovimientos(tx, asistenteId, { limite: 2 });
        expect(historial.map((m) => m.tipo)).toEqual(['vencimiento', 'canje']);
        const siguiente = await libro.listMovimientos(tx, asistenteId, {
          limite: 10,
          cursor: historial[1]?.id ?? '',
        });
        expect(siguiente).toHaveLength(3);
      });
    });

    it.each(['movimientos', 'participaciones', 'movimientos_lote', 'bitacora'])(
      '%s es de solo agregar: tiene el trigger y el API no puede editar ni borrar',
      async (tabla) => {
        const triggers = await base.owner.db.execute<{ total: number }>(
          sql`select count(*)::int as total from pg_trigger
              where tgrelid = ${tabla}::regclass and tgname = 'solo_agregar'`,
        );
        expect(triggers.rows[0]?.total).toBe(1);

        const { organizacionId } = await createOrganizacionYEvento(base.sistema.db);
        for (const consulta of [
          `update "${tabla}" set organizacion_id = organizacion_id`,
          `delete from "${tabla}"`,
        ]) {
          await expect(
            withOrganizacion(base.app.db, organizacionId, (tx) => tx.execute(sql.raw(consulta))),
          ).rejects.toThrow();
          await expect(base.sistema.db.execute(sql.raw(consulta))).rejects.toThrow();
        }
      },
    );

    it('el trigger rechaza cambiar un movimiento, también al dueño de la tabla', async () => {
      const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
      const asistenteId = await createAsistente(base.app.db, organizacionId, eventoId);
      const { movimiento } = await mover(organizacionId, {
        eventoId,
        asistenteId: asistenteId,
        tipo: 'checkin',
        origen: 'equipo',
        puntos: 10,
      });
      // Con RLS forzada, el dueño también tiene que fijar la organización para ver la fila.
      await expect(
        withOrganizacion(base.owner.db, organizacionId, (tx) =>
          tx.update(movimientos).set({ puntos: 500 }).where(eq(movimientos.id, movimiento.id)),
        ),
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/solo admite agregar/) } });
      await expect(
        withOrganizacion(base.owner.db, organizacionId, (tx) =>
          tx.delete(movimientos).where(eq(movimientos.id, movimiento.id)),
        ),
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/solo admite agregar/) } });
    });
  });
});
