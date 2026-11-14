/**
 * Mide en la red lo que cuesta cada operación del contrato (HU-104 §5, Contrato y sellador §9) e imprime
 * la tabla en Markdown para Costos de red §3. Crea contratos de prueba con datos inventados: no toca la base.
 *
 *   pnpm stellar:medir --red testnet
 *
 * Usa las cuentas de `pnpm stellar:cuentas --red <red>`: la llave del operador en
 * ~/.config/pasitos/stellar-operador-<red>.key y la dirección del admin de Stellar CLI.
 * Antes hay que compilar el contrato (`pnpm contrato:instalar --red <red>` lo compila e instala).
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildGenesis, buildHuella } from '@pasitos/firmas';
import {
  RpcStellar,
  StellarNoDisponible,
  type LlamadaContrato,
  type ParNumerico,
  type RecursosTx,
  type RedStellar,
} from '@pasitos/stellar';
import { readLlaveOperador } from '../config/trabajador.config';

const RPC_POR_RED: Record<RedStellar, string> = {
  local: 'http://127.0.0.1:8000/rpc',
  testnet: 'https://soroban-testnet.stellar.org',
};
// pnpm corre el comando desde la raíz del repositorio.
const WASM = resolve('contracts/target/wasm32v1-none/release/pasitos_evento.wasm');
/** Unos 6 meses de ledgers de 5 s. Debajo del máximo de la red (3 110 400). */
const LEDGERS_6_MESES = 3_110_000;
const STROOPS_POR_XLM = 10_000_000;

interface Medicion {
  readonly caso: string;
  readonly estimada: bigint;
  readonly cobrada: bigint;
  readonly recursos: RecursosTx;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { red: { type: 'string', default: 'local' } } });
  const red = values.red as RedStellar;
  if (!(red in RPC_POR_RED)) {
    throw new Error(`Red no permitida: ${String(values.red)}. Solo local o testnet (D50).`);
  }
  const wasm = new Uint8Array(readFileSync(WASM));
  const stellar = new RpcStellar({
    red,
    rpcUrl: process.env['STELLAR_MEDIR_RPC_URL'] ?? RPC_POR_RED[red],
    llaveOperador: readLlaveOperador(
      join(homedir(), '.config', 'pasitos', `stellar-operador-${red}.key`),
    ),
    adminDireccion: execFileSync('stellar', ['keys', 'address', `pasitos-admin-${red}`], {
      encoding: 'utf-8',
    }).trim(),
    wasmHash: createHash('sha256').update(wasm).digest('hex'),
  });
  const mediciones: Medicion[] = [];

  async function run(caso: string, llamada: LlamadaContrato) {
    const tx = await stellar.prepare(llamada);
    await stellar.send(tx);
    for (let intento = 0; intento < 60; intento++) {
      const resultado = await stellar.getResultado(tx.hash);
      if (resultado.estado === 'incluida') {
        mediciones.push({
          caso,
          estimada: tx.comisionEstimadaStroops,
          cobrada: resultado.comisionStroops,
          recursos: tx.recursos,
        });
        process.stderr.write(`✓ ${caso}: ${resultado.comisionStroops} stroops\n`);
        return resultado;
      }
      if (resultado.estado === 'fallida') {
        throw new Error(`${caso}: la transacción falló (${resultado.detalle.slice(0, 120)})`);
      }
      await new Promise((resolver) => setTimeout(resolver, 1_000));
    }
    throw new StellarNoDisponible(`${caso}: no entró en 60 s`);
  }

  const retos = (cantidad: number): ParNumerico[] =>
    Array.from({ length: cantidad }, (_, i) => [i + 1, 1_000] as const);
  const ahora = Math.floor(Date.now() / 1000);

  await run('Instalar el WASM', { operacion: 'upload_wasm', wasm });

  const contratos = new Map<number, { contratoId: string; idHash: Uint8Array }>();
  for (const cantidad of [1, 10, 50]) {
    const salt = new Uint8Array(randomBytes(32));
    const idHash = new Uint8Array(randomBytes(32));
    await run(`Crear la instancia con ${cantidad} reto(s)`, {
      operacion: 'deploy',
      salt,
      evento: { idHash, inicio: ahora, fin: ahora + 86_400 },
      retos: retos(cantidad),
    });
    contratos.set(cantidad, { contratoId: stellar.computeContratoId(salt), idHash });
  }

  const diez = contratos.get(10);
  if (!diez) throw new Error('Falta el contrato de 10 retos');
  const pantallas: (readonly [number, Uint8Array])[] = [];
  for (let numero = 1; numero <= 10; numero++) {
    const { publicKey } = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    pantallas.push([numero, new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))]);
  }
  await run('`add_pantallas` con 10 llaves', {
    operacion: 'add_pantallas',
    contratoId: diez.contratoId,
    pantallas,
  });

  const huellas = new Map<number, Uint8Array>();
  for (const [cantidad, { contratoId, idHash }] of contratos) {
    const conteos = retos(cantidad).map(([numero]) => [numero, 3] as const);
    const huellaAnterior = await buildGenesis(idHash);
    const raiz = new Uint8Array(randomBytes(32));
    await run(`\`anchor\` con ${cantidad} reto(s) en los conteos`, {
      operacion: 'anchor',
      contratoId,
      n: 1,
      huellaAnterior,
      raiz,
      conteos,
    });
    huellas.set(
      cantidad,
      await buildHuella({ eventoIdHash: idHash, n: 1, huellaAnterior, raiz, conteos }),
    );
  }

  await run('`close` con 10 retos', {
    operacion: 'close',
    contratoId: diez.contratoId,
    nFinal: 1,
    huellaFinal: huellas.get(10) ?? new Uint8Array(32),
    totales: {
      participaciones: retos(10).map(([numero]) => [numero, 3] as const),
      ganados: 3_000n,
      canjeados: 1_000n,
      ajustados: 0n,
      vencidos: 0n,
    },
  });
  const numeros = retos(10).map(([numero]) => numero);
  await run('Extender ~6 meses un contrato cerrado (instancia, 10 retos y 10 pantallas)', {
    operacion: 'extend_ttl',
    contratoId: diez.contratoId,
    ledgers: LEDGERS_6_MESES,
    retos: numeros,
    pantallas: numeros,
    incluirCodigo: false,
  });
  // Lo último: si el código ya estaba extendido de una medición anterior, sale casi gratis.
  await run('Extender ~6 meses el código (WASM), compartido por todos los eventos', {
    operacion: 'extend_ttl',
    contratoId: diez.contratoId,
    ledgers: LEDGERS_6_MESES,
    retos: [],
    pantallas: [],
    incluirCodigo: true,
  });

  const xlm = (stroops: bigint) =>
    (Number(stroops) / STROOPS_POR_XLM).toLocaleString('es-BO', { maximumFractionDigits: 7 });
  const miles = (valor: number) => valor.toLocaleString('es-BO');
  const filas = mediciones.map(
    (m) =>
      `| ${m.caso} | ${miles(Number(m.cobrada))} | ${xlm(m.cobrada)} | ${miles(Number(m.estimada))} | ` +
      `${miles(m.recursos.instrucciones)} | ${miles(m.recursos.bytesLeidos)} | ${miles(m.recursos.bytesEscritos)} | ` +
      `${m.recursos.entradasCreadas > 0 ? `Sí (${m.recursos.entradasCreadas})` : 'No'} |`,
  );
  process.stdout.write(
    [
      '',
      `Medido en **${red}** el ${new Date().toISOString().slice(0, 10)}, contrato versión 1 ` +
        `(WASM \`${createHash('sha256').update(wasm).digest('hex').slice(0, 12)}…\`, ${miles(wasm.length)} bytes).`,
      '',
      '| Operación | Cobrada (stroops) | Cobrada (XLM) | Estimada (stroops) | Instrucciones | Bytes leídos | Bytes escritos | ¿Crea datos nuevos? |',
      '|---|---|---|---|---|---|---|---|',
      ...filas,
      '',
    ].join('\n'),
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
