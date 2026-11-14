import { readFileSync } from 'node:fs';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { buildEventoIdHash, buildGenesis, buildHuella, equalBytes } from '@pasitos/firmas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { RpcStellar, TransaccionesStellarRepository } from '@pasitos/stellar';
import { AlertasEnLogs } from '../comun/alertas-operacion';
import { RELOJ_SISTEMA } from '../comun/reloj';
import { ContratoService } from '../contrato/contrato.service';
import { SelladorRepository } from './sellador.repository';
import { SelladorService } from './sellador.service';

/**
 * Sellador contra una red de Stellar de verdad (la local de `pnpm stellar:levantar`). Corre solo si están:
 *   STELLAR_PRUEBAS_RPC_URL, STELLAR_PRUEBAS_LLAVE_ARCHIVO, STELLAR_PRUEBAS_ADMIN, STELLAR_PRUEBAS_WASM_HASH
 * En el CI lo corre el job "Sellador con red local".
 */
const RPC = process.env['STELLAR_PRUEBAS_RPC_URL'];
const LLAVE = process.env['STELLAR_PRUEBAS_LLAVE_ARCHIVO'];
const ADMIN = process.env['STELLAR_PRUEBAS_ADMIN'];
const WASM = process.env['STELLAR_PRUEBAS_WASM_HASH'];

describe.runIf(RPC && LLAVE && ADMIN && WASM)('sellador con la red local de Stellar', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('crea el contrato, ancla tres lotes y cierra, y la cadena coincide con la red', async () => {
    const stellar = new RpcStellar({
      red: 'local',
      rpcUrl: RPC ?? '',
      llaveOperador: readFileSync(LLAVE ?? '', 'utf-8').trim(),
      adminDireccion: ADMIN ?? '',
      wasmHash: WASM ?? '',
    });
    const repositorio = new SelladorRepository(base.sistema.db);
    const transacciones = new TransaccionesStellarRepository(base.sistema.db, 'local');
    const alertas = new AlertasEnLogs(RELOJ_SISTEMA);
    const comisionMaxStroops = 100_000_000n;
    const sellador = new SelladorService(
      repositorio,
      stellar,
      transacciones,
      alertas,
      RELOJ_SISTEMA,
      {
        intervaloPorDefectoMin: 5,
        loteMax: 15,
        esperaConfirmacionMs: 30_000,
        consultaCadaMs: 1_000,
        margenVencimientoMs: 30_000,
        antiguedadMinimaMs: 0,
        comisionMaxStroops,
      },
    );
    const contrato = new ContratoService(
      repositorio,
      stellar,
      transacciones,
      sellador,
      alertas,
      RELOJ_SISTEMA,
      {
        margenVencimientoMs: 30_000,
        consultaCadaMs: 1_000,
        comisionMaxPreparacionStroops: comisionMaxStroops,
      },
    );

    // 12 asistentes: ~48 movimientos, en lotes de hasta 15 → al menos tres lotes.
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 12,
      minutos: 0,
    });
    const contratoId = await contrato.deployContrato(eventoId);
    await contrato.closeContrato(eventoId);

    expect(await stellar.getEstado(contratoId)).toBe('cerrado');
    const todos = await repositorio.listLotesPendientes(eventoId);
    expect(todos).toHaveLength(0);

    const idHash = await buildEventoIdHash(eventoId);
    let anterior = await buildGenesis(idHash);
    for (let numero = 1; ; numero++) {
      const lote = await repositorio.getLote(eventoId, numero);
      if (!lote) break;
      expect(lote.estado).toBe('confirmado');
      anterior = await buildHuella({
        eventoIdHash: idHash,
        n: numero,
        huellaAnterior: anterior,
        raiz: lote.raiz,
        conteos: lote.conteosPorReto as [number, number][],
      });
    }
    const ultimo = await stellar.getUltimo(contratoId);
    expect(ultimo.n).toBeGreaterThanOrEqual(3);
    expect(equalBytes(ultimo.huella, anterior)).toBe(true);

    // HU-104: cada transacción quedó registrada con lo que cobró la red.
    const costo = await transacciones.getCostoRed({ eventoId });
    expect(costo.porOperacion.deploy.cantidad).toBe(1);
    expect(costo.porOperacion.anchor.cantidad).toBeGreaterThanOrEqual(3);
    expect(costo.porOperacion.close.cantidad).toBe(1);
    expect(costo.comisionStroops).toBeGreaterThan(0n);
  }, 300_000);
});
