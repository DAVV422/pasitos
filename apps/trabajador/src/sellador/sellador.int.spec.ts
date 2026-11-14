import { inspect } from 'node:util';
import { Keypair } from '@stellar/stellar-sdk';
import { and, count, eq, sql } from 'drizzle-orm';
import {
  asistentes,
  bitacora,
  eventos,
  lotes,
  movimientos,
  movimientosLote,
  outbox,
  retos,
  withOrganizacion,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { buildEventoIdHash, buildGenesis, buildHuella, equalBytes } from '@pasitos/firmas';
import { LibroService } from '@pasitos/libro';
import { RpcStellar, StellarNoDisponible } from '@pasitos/stellar';
import type { FakeStellar } from '@pasitos/stellar/pruebas';
import { loadTrabajadorConfig } from '../config/trabajador.config';
import type { ContratoService } from '../contrato/contrato.service';
import { createEntorno, createEventoConContrato as createEventoEnBase } from '../pruebas/entorno';

/** Sellador contra PostgreSQL real y Stellar falso (HU-103). Requiere Docker. */
describe('sellador', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  function armar(opciones: { loteMax?: number } = {}) {
    return createEntorno(base, opciones);
  }

  function createEventoConContrato(contrato: ContratoService, asistentesPrueba = 10) {
    return createEventoEnBase(base, contrato, asistentesPrueba);
  }

  async function countSinLote(eventoId: string): Promise<number> {
    const filas = await base.sistema.db.execute<{ total: number }>(sql`
      select count(*)::int as total from movimientos m
       where m.evento_id = ${eventoId}
         and not exists (select 1 from movimientos_lote ml where ml.movimiento_id = m.id)`);
    return filas.rows[0]?.total ?? -1;
  }

  async function listLotes(eventoId: string) {
    return base.sistema.db
      .select()
      .from(lotes)
      .where(eq(lotes.eventoId, eventoId))
      .orderBy(lotes.numero);
  }

  /** Recalcula la cadena desde la génesis con las raíces y conteos guardados y la compara con la red. */
  async function expectCadenaCoincide(stellar: FakeStellar, eventoId: string, contratoId: string) {
    const idHash = await buildEventoIdHash(eventoId);
    let anterior = await buildGenesis(idHash);
    for (const lote of await listLotes(eventoId)) {
      expect(equalBytes(lote.huellaAnterior, anterior)).toBe(true);
      const huella = await buildHuella({
        eventoIdHash: idHash,
        n: lote.numero,
        huellaAnterior: anterior,
        raiz: lote.raiz,
        conteos: lote.conteosPorReto as [number, number][],
      });
      expect(equalBytes(huella, lote.huella)).toBe(true);
      anterior = huella;
    }
    const ultimo = await stellar.getUltimo(contratoId);
    expect(equalBytes(ultimo.huella, anterior)).toBe(true);
  }

  async function addMovimientos(eventoId: string, cantidad: number) {
    const [evento] = await base.sistema.db.select().from(eventos).where(eq(eventos.id, eventoId));
    const ids = await base.sistema.db
      .select({ id: asistentes.id })
      .from(asistentes)
      .where(eq(asistentes.eventoId, eventoId))
      .limit(cantidad);
    const libro = new LibroService();
    for (const { id } of ids) {
      await withOrganizacion(base.sistema.db, evento?.organizacionId ?? '', (tx) =>
        libro.addMovimiento(tx, {
          eventoId,
          asistenteId: id,
          tipo: 'checkin',
          origen: 'equipo',
          puntos: 5,
        }),
      );
    }
  }

  it('deploy-contrato crea un solo contrato aunque se ejecute dos veces', async () => {
    const { stellar, contrato } = armar();
    const { eventoId, contratoId } = await createEventoConContrato(contrato);
    expect(await contrato.deployContrato(eventoId)).toBe(contratoId);
    expect(stellar.contratos.size).toBe(1);
    expect(stellar.enviadas.filter((l) => l.operacion === 'deploy')).toHaveLength(1);
    const filas = await base.sistema.db.select().from(retos).where(eq(retos.eventoId, eventoId));
    expect(filas.every((r) => r.registradoEnStellarAt !== null)).toBe(true);
    expect((await stellar.getReto(contratoId, 1))?.tope).toBe(
      filas.find((r) => r.numero === 1)?.topeTotal,
    );
  });

  it('ancla todos los movimientos, cada uno en un solo lote, y la cadena coincide con la red', async () => {
    const { stellar, contrato, sellador } = armar();
    const { eventoId, contratoId } = await createEventoConContrato(contrato);

    expect(await sellador.processEvento(eventoId)).toBe('al_dia');
    expect(await countSinLote(eventoId)).toBe(0);
    const [{ total: asignados } = { total: 0 }] = await base.sistema.db
      .select({ total: count() })
      .from(movimientosLote)
      .where(eq(movimientosLote.eventoId, eventoId));
    const [{ total: libro } = { total: 0 }] = await base.sistema.db
      .select({ total: count() })
      .from(movimientos)
      .where(eq(movimientos.eventoId, eventoId));
    expect(asignados).toBe(libro);
    const todos = await listLotes(eventoId);
    expect(todos.every((l) => l.estado === 'confirmado' && l.ledgerStellar !== null)).toBe(true);
    await expectCadenaCoincide(stellar, eventoId, contratoId);

    const avisos = await base.sistema.db
      .select()
      .from(outbox)
      .where(and(eq(outbox.tipo, 'lote.anclado'), eq(outbox.eventoId, eventoId)));
    expect(avisos).toHaveLength(todos.length);
  });

  it('con más movimientos que el máximo arma varios lotes seguidos, en orden', async () => {
    const { stellar, contrato, sellador } = armar({ loteMax: 7 });
    const { eventoId, contratoId } = await createEventoConContrato(contrato, 8);
    await sellador.processEvento(eventoId);
    const todos = await listLotes(eventoId);
    expect(todos.length).toBeGreaterThan(2);
    expect(todos.map((l) => l.numero)).toEqual(todos.map((_, i) => i + 1));
    expect(await countSinLote(eventoId)).toBe(0);
    await expectCadenaCoincide(stellar, eventoId, contratoId);
  });

  it('respeta el intervalo y sin movimientos nuevos no llama al contrato', async () => {
    const { stellar, contrato, sellador, reloj } = armar();
    const { eventoId } = await createEventoConContrato(contrato);
    await sellador.processEvento(eventoId);
    const anclajes = () => stellar.enviadas.filter((l) => l.operacion === 'anchor').length;
    const despuesDelPrimero = anclajes();

    await addMovimientos(eventoId, 3);
    reloj.adelantar(3_000);
    await sellador.processEvento(eventoId);
    expect(await countSinLote(eventoId)).toBe(3); // No pasaron los 5 minutos.

    reloj.adelantar(5 * 60_000);
    await sellador.processEvento(eventoId);
    expect(await countSinLote(eventoId)).toBe(0);
    expect(anclajes()).toBe(despuesDelPrimero + 1);

    reloj.adelantar(5 * 60_000);
    expect(await sellador.processEvento(eventoId)).toBe('al_dia');
    expect(anclajes()).toBe(despuesDelPrimero + 1);
  });

  it('una transacción lenta que confirma después de armar entra en el lote siguiente', async () => {
    const { contrato, sellador, reloj } = armar();
    const { eventoId } = await createEventoConContrato(contrato);
    const [asistente] = await base.sistema.db
      .select({ id: asistentes.id, organizacionId: asistentes.organizacionId })
      .from(asistentes)
      .where(eq(asistentes.eventoId, eventoId))
      .limit(1);

    let liberar: () => void = () => undefined;
    const bloqueo = new Promise<void>((resolver) => (liberar = resolver));
    let empezo: () => void = () => undefined;
    const empezada = new Promise<void>((resolver) => (empezo = resolver));
    const lenta = withOrganizacion(base.app.db, asistente?.organizacionId ?? '', async (tx) => {
      await new LibroService().addMovimiento(tx, {
        eventoId,
        asistenteId: asistente?.id ?? '',
        tipo: 'checkin',
        origen: 'equipo',
        puntos: 1,
      });
      empezo();
      await bloqueo; // Sin confirmar mientras el sellador arma.
    });
    await empezada;
    await sellador.processEvento(eventoId);
    liberar();
    await lenta;
    expect(await countSinLote(eventoId)).toBe(1);

    reloj.adelantar(6 * 60_000);
    await sellador.processEvento(eventoId);
    expect(await countSinLote(eventoId)).toBe(0);
  });

  it('V11: con el RPC caído los lotes se siguen armando y al volver se anclan en orden, sin duplicar', async () => {
    const { stellar, contrato, sellador, reloj } = armar();
    const { eventoId, contratoId } = await createEventoConContrato(contrato);
    stellar.caido = true;
    await expect(sellador.processEvento(eventoId)).rejects.toBeInstanceOf(StellarNoDisponible);
    await addMovimientos(eventoId, 4);
    reloj.adelantar(6 * 60_000);
    await expect(sellador.processEvento(eventoId)).rejects.toBeInstanceOf(StellarNoDisponible);
    const mientrasCaido = await listLotes(eventoId);
    expect(mientrasCaido.map((l) => l.estado)).toEqual(['armado', 'armado']);

    stellar.caido = false;
    expect(await sellador.processEvento(eventoId)).toBe('al_dia');
    const anclados = stellar.enviadas.filter((l) => l.operacion === 'anchor');
    expect(anclados.map((l) => (l.operacion === 'anchor' ? l.n : 0))).toEqual([1, 2]);
    await expectCadenaCoincide(stellar, eventoId, contratoId);
  });

  it('si la transacción entró pero se perdió la respuesta, la da por buena sin reenviar', async () => {
    const { stellar, contrato, sellador } = armar();
    const { eventoId } = await createEventoConContrato(contrato);
    stellar.perderRespuestaEnvio = true;
    expect(await sellador.processEvento(eventoId)).toBe('al_dia');
    expect(stellar.enviadas.filter((l) => l.operacion === 'anchor')).toHaveLength(1);
  });

  it('reinicio a mitad de camino: retoma desde armado y desde enviado, y confirma una sola vez', async () => {
    const { stellar, contrato, sellador, crearSellador, reloj } = armar();
    const { eventoId, contratoId } = await createEventoConContrato(contrato);

    // Se cae después de armar: el lote queda armado.
    await sellador.armLote(eventoId);
    expect((await listLotes(eventoId))[0]?.estado).toBe('armado');

    // Otro proceso lo envía pero la transacción no entra: queda enviado.
    stellar.noIncluir = true;
    expect(await crearSellador().processEvento(eventoId)).toBe('pendiente');
    expect((await listLotes(eventoId))[0]?.estado).toBe('enviado');

    // Arranca de nuevo: espera a que venza, la rearma y la confirma.
    stellar.noIncluir = false;
    reloj.adelantar(2 * 60_000);
    expect(await crearSellador().processEvento(eventoId)).toBe('al_dia');
    const [lote] = await listLotes(eventoId);
    expect(lote?.estado).toBe('confirmado');
    expect(lote?.intentos).toBe(2);
    expect(stellar.enviadas.filter((l) => l.operacion === 'anchor')).toHaveLength(1);
    await expectCadenaCoincide(stellar, eventoId, contratoId);
  });

  it('un lote rechazado detiene ese evento y no otros, alerta, y se puede rearmar', async () => {
    const { stellar, contrato, sellador, alertas, reloj } = armar();
    const uno = await createEventoConContrato(contrato);
    const otro = await createEventoConContrato(contrato);
    stellar.setTope(uno.contratoId, 1, 0); // La red queda con un tope menor que la base.

    expect(await sellador.processEvento(uno.eventoId)).toBe('detenido');
    expect((await listLotes(uno.eventoId))[0]?.ultimoError).toBe('TopeSuperado');
    expect(alertas.recibidas.map((a) => a.codigo)).toContain('LOTE_RECHAZADO');

    await addMovimientos(uno.eventoId, 2);
    reloj.adelantar(6 * 60_000);
    expect(await sellador.processEvento(uno.eventoId)).toBe('detenido');
    expect(await listLotes(uno.eventoId)).toHaveLength(1); // No se arma nada más.

    expect(await sellador.processEvento(otro.eventoId)).toBe('al_dia');

    stellar.setTope(uno.contratoId, 1, 1000);
    await sellador.rearmLote(uno.eventoId, 1, 'Tope corregido en la prueba');
    expect(await sellador.processEvento(uno.eventoId)).toBe('al_dia');
    await expectCadenaCoincide(stellar, uno.eventoId, uno.contratoId);
    const registro = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, uno.eventoId), eq(bitacora.accion, 'lote.rearmar')));
    expect(registro).toHaveLength(1);
  });

  it('close-contrato ancla lo que queda sin esperar y cierra; ejecutarlo dos veces no hace nada más', async () => {
    const { stellar, contrato } = armar();
    const { eventoId, contratoId } = await createEventoConContrato(contrato);
    await contrato.closeContrato(eventoId);
    expect(await stellar.getEstado(contratoId)).toBe('cerrado');
    expect(await countSinLote(eventoId)).toBe(0);
    const todos = await listLotes(eventoId);
    expect(todos.at(-1)?.esCierre).toBe(true);
    const cierres = stellar.enviadas.filter((l) => l.operacion === 'close');
    expect(cierres).toHaveLength(1);
    await contrato.closeContrato(eventoId);
    expect(stellar.enviadas.filter((l) => l.operacion === 'close')).toHaveLength(1);
  });

  it('avisa de un lote atrasado', async () => {
    const { stellar, contrato, sellador, alertas, reloj } = armar();
    const { eventoId } = await createEventoConContrato(contrato);
    stellar.caido = true;
    await expect(sellador.processEvento(eventoId)).rejects.toBeInstanceOf(StellarNoDisponible);
    reloj.adelantar(16 * 60_000);
    await sellador.checkAtrasos();
    expect(alertas.recibidas.map((a) => a.codigo)).toEqual(
      expect.arrayContaining(['ANCLAJE_ATRASADO', 'STELLAR_SIN_RESPUESTA']),
    );
  });
});

describe('seguridad de la llave del operador', () => {
  it('no aparece al serializar ni al inspeccionar el adaptador', () => {
    const llave = Keypair.random().secret();
    const adaptador = new RpcStellar({
      red: 'local',
      rpcUrl: 'http://127.0.0.1:8000/rpc',
      llaveOperador: llave,
      adminDireccion: Keypair.random().publicKey(),
    });
    expect(JSON.stringify(adaptador)).not.toContain(llave);
    expect(inspect(adaptador, { depth: 10, showHidden: true })).not.toContain(llave);
  });

  it('el trabajador no arranca con mainnet', () => {
    expect(() =>
      loadTrabajadorConfig({
        DATABASE_URL_SISTEMA: 'postgres://x:y@localhost:5432/pasitos',
        STELLAR_RED: 'mainnet',
        STELLAR_RPC_URL: 'https://rpc.example.com',
        STELLAR_OPERADOR_LLAVE_ARCHIVO: '/tmp/llave',
        STELLAR_ADMIN_DIRECCION: Keypair.random().publicKey(),
      }),
    ).toThrow(/mainnet/);
  });
});
