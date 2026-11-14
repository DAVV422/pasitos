import { and, eq, sql } from 'drizzle-orm';
import { lotes, transaccionesStellar } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { formatMes, StellarNoDisponible } from '@pasitos/stellar';
import { createEntorno, createEventoConContrato } from '../pruebas/entorno';

/** Control de costo de red (HU-104) con PostgreSQL real y Stellar falso. Requiere Docker. */
describe('control de costo de red', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  function listTransacciones(eventoId: string) {
    return base.sistema.db
      .select()
      .from(transaccionesStellar)
      .where(eq(transaccionesStellar.eventoId, eventoId))
      .orderBy(transaccionesStellar.createdAt);
  }

  it('registra cada transacción del operador con la comisión estimada y la cobrada', async () => {
    const { contrato, sellador } = createEntorno(base);
    const { eventoId } = await createEventoConContrato(base, contrato);
    await sellador.processEvento(eventoId, { forzar: true });
    await contrato.closeContrato(eventoId);

    const filas = await listTransacciones(eventoId);
    expect(filas.map((f) => f.operacion)).toEqual(['deploy', 'anchor', 'close']);
    for (const fila of filas) {
      expect(fila.resultado).toBe('incluida');
      expect(fila.red).toBe('local');
      expect(fila.comisionEstimadaStroops).toBe(100_000n);
      expect(fila.comisionStroops).toBe(90_000n);
      expect(fila.ledgerStellar).toBeGreaterThan(0);
      expect(fila.recursos).toMatchObject({ instrucciones: expect.any(Number) });
    }
    const [lote] = await base.sistema.db.select().from(lotes).where(eq(lotes.eventoId, eventoId));
    expect(filas[1]?.loteId).toBe(lote?.id);
  });

  it('una transacción que vence sin entrar también queda, como vencida y sin cobro', async () => {
    const { contrato, sellador, stellar, reloj } = createEntorno(base);
    const { eventoId } = await createEventoConContrato(base, contrato);
    stellar.noIncluir = true;
    expect(await sellador.processEvento(eventoId, { forzar: true })).toBe('pendiente');
    reloj.adelantar(120_000);
    stellar.noIncluir = false;
    expect(await sellador.processEvento(eventoId)).toBe('al_dia');

    const anchors = (await listTransacciones(eventoId)).filter((f) => f.operacion === 'anchor');
    expect(anchors.map((f) => f.resultado)).toEqual(['vencida', 'incluida']);
    expect(anchors[0]?.comisionStroops).toBeNull();
  });

  it('el resultado se fija una sola vez y las filas no se borran', async () => {
    const { contrato } = createEntorno(base);
    const { eventoId } = await createEventoConContrato(base, contrato);
    const [fila] = await listTransacciones(eventoId);
    await expect(
      base.sistema.db
        .update(transaccionesStellar)
        .set({ resultado: 'fallida' })
        .where(eq(transaccionesStellar.id, fila?.id ?? '')),
    ).rejects.toMatchObject({ cause: { message: expect.stringContaining('solo se fija') } });
    await expect(
      base.sistema.db
        .delete(transaccionesStellar)
        .where(eq(transaccionesStellar.id, fila?.id ?? '')),
    ).rejects.toThrow();
    // El API no la lee.
    await expect(base.app.db.select().from(transaccionesStellar).limit(1)).rejects.toThrow();
  });

  it('con la comisión sobre el tope el lote queda armado, alerta a los 30 minutos y sale cuando baja', async () => {
    const { contrato, sellador, stellar, reloj, alertas, repositorio } = createEntorno(base, {
      comisionMaxStroops: 500_000n,
    });
    const { eventoId } = await createEventoConContrato(base, contrato);
    stellar.comisionEstimada = 800_000n;

    expect(await sellador.processEvento(eventoId, { forzar: true })).toBe('pendiente');
    let [lote] = await repositorio.listLotesPendientes(eventoId);
    expect(lote?.estado).toBe('armado');
    expect(lote?.ultimoError).toBe('Comisión sobre el tope');
    expect(stellar.enviadas.filter((l) => l.operacion === 'anchor')).toHaveLength(0);
    expect(alertas.codigos()).not.toContain('COMISION_SOBRE_TOPE');

    reloj.adelantar(31 * 60_000);
    expect(await sellador.processEvento(eventoId)).toBe('pendiente');
    expect(alertas.codigos()).toContain('COMISION_SOBRE_TOPE');

    stellar.comisionEstimada = 120_000n;
    expect(await sellador.processEvento(eventoId)).toBe('al_dia');
    [lote] = await repositorio.listLotesPendientes(eventoId);
    expect(lote).toBeUndefined();
    const anchors = (await listTransacciones(eventoId)).filter((f) => f.operacion === 'anchor');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.comisionEstimadaStroops).toBe(120_000n);
  });

  it('close se envía aunque supere el tope, y alerta; las otras operaciones esperan', async () => {
    const { contrato, sellador, stellar, alertas } = createEntorno(base, {
      comisionMaxPreparacionStroops: 500_000n,
    });
    const { eventoId: sinContrato } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 2,
      minutos: 0,
    });
    stellar.comisionEstimada = 800_000n;
    await expect(contrato.deployContrato(sinContrato)).rejects.toThrow('supera el tope');
    expect(await listTransacciones(sinContrato)).toHaveLength(0);

    stellar.comisionEstimada = 100_000n;
    const { eventoId, contratoId } = await createEventoConContrato(base, contrato);
    await sellador.processEvento(eventoId, { forzar: true });
    stellar.comisionEstimada = 800_000n;
    await contrato.closeContrato(eventoId);
    expect(await stellar.getEstado(contratoId)).toBe('cerrado');
    expect(alertas.recibidas).toContainEqual(
      expect.objectContaining({
        codigo: 'COMISION_SOBRE_TOPE',
        eventoId,
        detalle: expect.objectContaining({ operacion: 'close' }),
      }),
    );
  });

  it('getCostoRed de un evento de movimientos-prueba da la suma de sus transacciones', async () => {
    const { contrato, sellador, transacciones } = createEntorno(base, { loteMax: 10 });
    const { eventoId } = await createEventoConContrato(base, contrato);
    await sellador.processEvento(eventoId, { forzar: true });
    await contrato.closeContrato(eventoId);

    const filas = await listTransacciones(eventoId);
    const suma = filas.reduce((total, f) => total + (f.comisionStroops ?? 0n), 0n);
    const costo = await transacciones.getCostoRed({ eventoId });
    expect(costo.transacciones).toBe(filas.length);
    expect(costo.comisionStroops).toBe(suma);
    expect(costo.porOperacion.anchor.cantidad).toBe(
      filas.filter((f) => f.operacion === 'anchor').length,
    );
    expect(costo.porOperacion.anchor.cantidad).toBeGreaterThan(1);
    expect(costo.porOperacion.upload_wasm).toEqual({ cantidad: 0, comisionStroops: 0n });

    const delMes = await transacciones.getCostoRed({ eventoId, mes: formatMes(new Date()) });
    expect(delMes.comisionStroops).toBe(suma);
    const otroMes = await transacciones.getCostoRed({ eventoId, mes: '2020-01' });
    expect(otroMes.transacciones).toBe(0);
  });

  it('pasar el 80 % del presupuesto alerta una vez; pasar el 100 %, otra crítica', async () => {
    const { transacciones } = createEntorno(base);
    const { comisionStroops: gastado } = await transacciones.getCostoRed({
      mes: formatMes(new Date()),
    });
    expect(gastado).toBeGreaterThan(0n);

    // Gastado = 85 % del presupuesto.
    const ochenta = createEntorno(base, { presupuestoMensualStroops: (gastado * 100n) / 85n });
    await ochenta.costo.checkPresupuesto();
    await ochenta.costo.checkPresupuesto();
    expect(ochenta.alertas.codigos()).toEqual(['PRESUPUESTO_RED_80']);

    const cien = createEntorno(base, { presupuestoMensualStroops: gastado });
    await cien.costo.checkPresupuesto();
    expect(cien.alertas.recibidas).toEqual([
      expect.objectContaining({ codigo: 'PRESUPUESTO_RED_100', gravedad: 'critica' }),
    ]);

    const holgado = createEntorno(base, { presupuestoMensualStroops: gastado * 10n });
    await holgado.costo.checkPresupuesto();
    const sinPresupuesto = createEntorno(base);
    await sinPresupuesto.costo.checkPresupuesto();
    expect([...holgado.alertas.codigos(), ...sinPresupuesto.alertas.codigos()]).toEqual([]);
  });

  it('saldo: pide fondos a Friendbot debajo de 1 000 XLM y alerta si alcanza para menos de 30 días', async () => {
    const { costo, stellar, alertas } = createEntorno(base);
    stellar.saldo = 50_000_000n; // 5 XLM
    const recargado = await costo.checkSaldoOperador();
    expect(stellar.fondosPedidos).toBe(1);
    expect(recargado.fondosPedidos).toBe(true);
    expect(recargado.dias).toBeGreaterThan(30);
    expect(alertas.codigos()).toEqual([]);

    // Friendbot no responde: queda el saldo bajo y alerta.
    stellar.saldo = 50_000_000n;
    stellar.requestFondos = async () => {
      throw new StellarNoDisponible('Friendbot caído (simulado)');
    };
    const bajo = await costo.checkSaldoOperador();
    expect(bajo.dias).toBeLessThan(30);
    // Mínimo: 12 anchor por hora durante 8 h, al costo medido de un anchor (90 000 stroops en el falso).
    expect(bajo.gastoDiarioStroops).toBeGreaterThanOrEqual(96n * 90_000n);
    expect(alertas.recibidas).toEqual([
      expect.objectContaining({ codigo: 'SALDO_OPERADOR_BAJO', gravedad: 'aviso' }),
    ]);
  });

  it('la salud del API lee la antigüedad del último anclaje sin ver la tabla', async () => {
    const filas = await base.app.db.execute<{ segundos: number | null }>(
      sql`select segundos_desde_ultimo_anclaje() as segundos`,
    );
    expect(filas.rows[0]?.segundos).toBeGreaterThanOrEqual(0);
    const ultima = await base.sistema.db
      .select({ resueltaAt: transaccionesStellar.resueltaAt })
      .from(transaccionesStellar)
      .where(
        and(
          eq(transaccionesStellar.operacion, 'anchor'),
          eq(transaccionesStellar.resultado, 'incluida'),
        ),
      )
      .limit(1);
    expect(ultima).toHaveLength(1);
  });
});
