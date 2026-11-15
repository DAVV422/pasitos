import { and, eq } from 'drizzle-orm';
import { bitacora, eventos, outbox } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { runTrabajoStellar, type TrabajoStellar } from '../colas/colas';
import { createEntorno } from '../pruebas/entorno';
import { AperturaEventosService, OutboxService } from './outbox.service';

/** Del outbox a Stellar y la apertura automática (HU-205 §3 y §4). Requiere Docker. */
describe('Outbox y apertura de eventos (HU-205)', () => {
  let base: BaseDePrueba;
  let entorno: ReturnType<typeof createEntorno>;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    entorno = createEntorno(base);
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  async function addOutbox(tipo: string, eventoId: string) {
    const id = uuidv7();
    await base.sistema.db.insert(outbox).values({ id, tipo, eventoId, payload: { eventoId } });
    return id;
  }

  async function getProcesado(id: string) {
    const [fila] = await base.sistema.db.select().from(outbox).where(eq(outbox.id, id));
    return fila?.procesadoAt ?? null;
  }

  it('evento.publicado → deploy-contrato: el contrato queda creado con sus retos', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const id = await addOutbox('evento.publicado', eventoId);
    const encolados: TrabajoStellar[] = [];
    // El encolado real va a pg-boss; aquí se corre el trabajo en el momento.
    const servicio = new OutboxService(base.sistema.db, async (trabajo) => {
      encolados.push(trabajo);
      await runTrabajoStellar(
        trabajo.trabajo,
        trabajo.eventoId,
        entorno.sellador,
        entorno.contrato,
      );
    });
    expect(await servicio.processOutbox()).toEqual({ procesadas: 1, fallidas: 0 });
    expect(encolados).toEqual([{ trabajo: 'deploy-contrato', eventoId }]);
    expect(await getProcesado(id)).not.toBeNull();
    const [evento] = await base.sistema.db.select().from(eventos).where(eq(eventos.id, eventoId));
    expect(evento?.contratoId).toBeTruthy();
    // Otra vuelta no lo repite.
    expect(await servicio.processOutbox()).toEqual({ procesadas: 0, fallidas: 0 });
  });

  it('si encolar falla, la fila no se marca y se reintenta en la vuelta siguiente', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const id = await addOutbox('reto.cambiado', eventoId);
    let falla = true;
    const servicio = new OutboxService(base.sistema.db, () => {
      if (falla) {
        return Promise.reject(new Error('pg-boss no responde'));
      }
      return Promise.resolve();
    });
    expect((await servicio.processOutbox()).fallidas).toBe(1);
    expect(await getProcesado(id)).toBeNull();
    falla = false;
    expect((await servicio.processOutbox()).procesadas).toBeGreaterThanOrEqual(1);
    expect(await getProcesado(id)).not.toBeNull();
  });

  it('los avisos que no son de Stellar quedan para su procesador', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const id = await addOutbox('evento.pausado', eventoId);
    await new OutboxService(base.sistema.db, () => Promise.resolve()).processOutbox();
    expect(await getProcesado(id)).toBeNull();
  });

  it('abre a su hora los publicados con contrato; sin contrato, avisa a los 5 minutos', async () => {
    const ahora = entorno.reloj.now();
    const conContrato = (
      await seedMovimientosPrueba(base.sistema.db, { asistentes: 1, minutos: 0 })
    ).eventoId;
    const sinContrato = (
      await seedMovimientosPrueba(base.sistema.db, { asistentes: 1, minutos: 0 })
    ).eventoId;
    const futuro = (await seedMovimientosPrueba(base.sistema.db, { asistentes: 1, minutos: 0 }))
      .eventoId;
    const hace = (ms: number) => new Date(ahora.getTime() - ms);
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'publicado', inicioAt: hace(60_000), contratoId: 'C'.repeat(56) })
      .where(eq(eventos.id, conContrato));
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'publicado', inicioAt: hace(6 * 60_000), contratoId: null })
      .where(eq(eventos.id, sinContrato));
    await base.sistema.db
      .update(eventos)
      .set({
        estado: 'publicado',
        inicioAt: new Date(ahora.getTime() + 3_600_000),
        finAt: new Date(ahora.getTime() + 7_200_000),
      })
      .where(eq(eventos.id, futuro));

    const apertura = new AperturaEventosService(base.sistema.db, entorno.alertas, entorno.reloj);
    const resultado = await apertura.openEventos();
    expect(resultado.abiertos).toContain(conContrato);
    expect(resultado.abiertos).not.toContain(futuro);
    expect(resultado.sinContrato).toContain(sinContrato);
    expect(entorno.alertas.recibidas.map((a) => [a.codigo, a.eventoId])).toContainEqual([
      'EVENTO_SIN_CONTRATO_A_TIEMPO',
      sinContrato,
    ]);

    const [abierto] = await base.sistema.db
      .select()
      .from(eventos)
      .where(eq(eventos.id, conContrato));
    expect(abierto?.estado).toBe('en_curso');
    const filas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, conContrato), eq(bitacora.accion, 'evento.open')));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ actorTipo: 'sistema', actorNombre: 'Pasitos (automático)' });
  });
});
