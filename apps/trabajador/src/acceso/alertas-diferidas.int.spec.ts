import { and, eq } from 'drizzle-orm';
import { alertas, escaneos, eventos, outbox, pantallas, qrEmitidos, retos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { AlertasDiferidasService } from './alertas-diferidas.service';

/** Un No fui yo sin atender sube de prioridad a los 10 minutos (HU-305 §2). Requiere Docker. */
describe('alertas-diferidas', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('sube a alta solo los No fui yo abiertos de más de 10 minutos, y avisa', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    const reloj = createReloj();
    const hace = (minutos: number) => new Date(reloj.now().getTime() - minutos * 60_000);
    const ids = { viejo: uuidv7(), nuevo: uuidv7(), atendido: uuidv7(), a1: uuidv7() };
    for (const [id, tipo, estado, creado] of [
      [ids.viejo, 'no_fui_yo', 'abierta', hace(11)],
      [ids.nuevo, 'no_fui_yo', 'abierta', hace(5)],
      [ids.atendido, 'no_fui_yo', 'atendiendo', hace(30)],
      [ids.a1, 'A1', 'abierta', hace(30)],
    ] as const) {
      await base.sistema.db.insert(alertas).values({
        id,
        organizacionId: evento?.organizacionId ?? '',
        eventoId,
        tipo,
        estado,
        clave: `prueba:${id}`,
        createdAt: creado,
      });
    }

    const servicio = new AlertasDiferidasService(base.sistema.db, reloj);
    expect(await servicio.raisePrioridad()).toBe(1);
    const filas = await base.sistema.db.select().from(alertas);
    const prioridad = (id: string) => filas.find((f) => f.id === id)?.prioridad;
    expect([ids.viejo, ids.nuevo, ids.atendido, ids.a1].map(prioridad)).toEqual([
      'alta',
      'normal',
      'normal',
      'normal',
    ]);
    const avisos = await base.sistema.db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.tipo, 'alerta.actualizada'));
    expect(avisos.map((a) => (a.payload as { alertaId: string }).alertaId)).toEqual([ids.viejo]);
    expect(await servicio.raisePrioridad()).toBe(0);
  });
  it('A6 (HU-318): más de 10 vencidos después de cada uno de los últimos 3 cambios de QR', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    const organizacionId = evento?.organizacionId ?? '';
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'en_curso' })
      .where(eq(eventos.id, eventoId));
    const reloj = createReloj();
    const pantallaId = uuidv7();
    await base.sistema.db
      .insert(pantallas)
      .values({ id: pantallaId, organizacionId, eventoId, nombre: 'Tablet A6' });
    const [reto] = await base.sistema.db
      .select({ id: retos.id })
      .from(retos)
      .where(eq(retos.eventoId, eventoId));
    const ahora = reloj.now().getTime();
    for (const minutos of [4, 3, 2]) {
      const inicio = new Date(ahora - minutos * 60_000);
      await base.sistema.db.insert(qrEmitidos).values({
        id: uuidv7(),
        organizacionId,
        eventoId,
        pantallaId,
        retoId: reto?.id ?? '',
        modo: 'por_tiempo',
        epoca: minutos,
        franja: minutos,
        inicioAt: inicio,
      });
      await base.sistema.db.insert(escaneos).values(
        Array.from({ length: 11 }, (_, i) => ({
          id: uuidv7(),
          organizacionId,
          eventoId,
          pantallaId,
          resultado: 'vencido',
          createdAt: new Date(inicio.getTime() + 1_000 + i * 1_000),
        })),
      );
    }
    const servicio = new AlertasDiferidasService(base.sistema.db, reloj);
    expect(await servicio.raiseA6()).toBe(1);
    const a6 = await base.sistema.db
      .select()
      .from(alertas)
      .where(and(eq(alertas.eventoId, eventoId), eq(alertas.tipo, 'A6')));
    expect(a6[0]?.datos).toMatchObject({ pantallaId, vencidos: [11, 11, 11] });
    // Una sola vez por ventana.
    expect(await servicio.raiseA6()).toBe(0);
  });
});
