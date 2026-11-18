import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { canjeItems, canjes, eventos, mesas, outbox, premios } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { VencerCobrosService } from './vencer-cobros.service';

/** vencer-cobros (HU-316 §2): libera el stock de los cobros vencidos. Requiere Docker. */
describe('vencer-cobros', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('pasa a vencido solo lo pendiente vencido, devuelve el stock y avisa a la mesa', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    const organizacionId = evento?.organizacionId ?? '';
    const reloj = createReloj();
    const mesaId = uuidv7();
    await base.sistema.db
      .insert(mesas)
      .values({ id: mesaId, organizacionId, eventoId, nombre: 'Mesa 1' });
    const premioId = uuidv7();
    await base.sistema.db.insert(premios).values({
      id: premioId,
      organizacionId,
      eventoId,
      nombre: 'Taza',
      puntos: 10,
      stockTotal: 10,
      stockReservado: 3,
    });
    const ids = { vencido: uuidv7(), vigente: uuidv7() };
    for (const [id, expira, cantidad, comprobante] of [
      [ids.vencido, -1_000, 2, 'C-0001'],
      [ids.vigente, 60_000, 1, 'C-0002'],
    ] as const) {
      await base.sistema.db.insert(canjes).values({
        id,
        organizacionId,
        eventoId,
        mesaId,
        tokenHash: randomBytes(32),
        comprobante,
        totalPuntos: 10 * cantidad,
        expiraAt: new Date(reloj.now().getTime() + expira),
      });
      await base.sistema.db.insert(canjeItems).values({
        id: uuidv7(),
        organizacionId,
        canjeId: id,
        premioId,
        cantidad,
        puntosUnitarios: 10,
      });
    }

    const servicio = new VencerCobrosService(base.sistema.db, reloj);
    expect(await servicio.expire()).toBe(1);
    const filas = await base.sistema.db.select().from(canjes);
    expect(filas.find((c) => c.id === ids.vencido)?.estado).toBe('vencido');
    expect(filas.find((c) => c.id === ids.vigente)?.estado).toBe('pendiente');
    const [premio] = await base.sistema.db.select().from(premios).where(eq(premios.id, premioId));
    expect(premio?.stockReservado).toBe(1);
    const avisos = await base.sistema.db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.tipo, 'canje.vencido'));
    expect(avisos.map((a) => a.payload)).toEqual([
      expect.objectContaining({ mesaId, canjeId: ids.vencido, comprobante: 'C-0001' }),
    ]);
    expect(await servicio.expire()).toBe(0);
  });
});
