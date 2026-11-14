#!/usr/bin/env node
/**
 * Stellar en desarrollo (HU-102 §5). Usa Stellar CLI (25.2 o superior).
 * Las llaves quedan en la configuración de Stellar CLI del equipo (~/.config/stellar), nunca en el repositorio.
 *
 *   pnpm stellar:cuentas  --red local|testnet   # operador y admin de prueba, fondeados con Friendbot
 *   pnpm contrato:instalar --red local|testnet  # compila, sube el WASM e imprime STELLAR_WASM_HASH
 *   pnpm contrato:probar  --red local|testnet   # despliega una instancia de prueba y llama a version()
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const RAIZ = resolve(import.meta.dirname, '..');
const WASM = resolve(RAIZ, 'contracts/target/wasm32v1-none/release/pasitos_evento.wasm');
const REDES = new Set(['local', 'testnet']);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { red: { type: 'string', default: 'local' }, 'wasm-hash': { type: 'string' } },
});
const [comando] = positionals;
const red = values.red;
if (!REDES.has(red)) {
  fallar(`Red no permitida: ${red}. En el piloto solo local o testnet (D50).`);
}

const operador = `pasitos-operador-${red}`;
const admin = `pasitos-admin-${red}`;

function stellar(args, opciones = {}) {
  return execFileSync('stellar', args, {
    cwd: opciones.cwd ?? RAIZ,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', opciones.silencioso ? 'pipe' : 'inherit'],
  }).trim();
}

function fallar(mensaje) {
  process.stderr.write(`${mensaje}\n`);
  process.exit(1);
}

function existeLlave(alias) {
  try {
    stellar(['keys', 'address', alias], { silencioso: true });
    return true;
  } catch {
    return false;
  }
}

function crearCuentas() {
  for (const alias of [operador, admin]) {
    if (existeLlave(alias)) {
      process.stdout.write(`Ya existe ${alias}; se fondea de nuevo si hace falta.\n`);
      try {
        stellar(['keys', 'fund', alias, '--network', red], { silencioso: true });
      } catch {
        // Ya tenía fondos.
      }
    } else {
      stellar(['keys', 'generate', alias, '--network', red, '--fund']);
    }
  }
  // El trabajador lee la llave del operador de un archivo (HU-103 §1), fuera del repositorio.
  const carpeta = join(homedir(), '.config', 'pasitos');
  mkdirSync(carpeta, { recursive: true });
  const archivo = join(carpeta, `stellar-operador-${red}.key`);
  writeFileSync(
    archivo,
    `${stellar(['keys', 'show', operador], { silencioso: true })}
`,
    { mode: 0o600 },
  );
  process.stdout.write(
    [
      '',
      'Cuentas listas. Al .env van las direcciones públicas y la ruta del archivo de la llave:',
      `  STELLAR_OPERADOR_LLAVE_ARCHIVO=${archivo}`,
      `  STELLAR_ADMIN_DIRECCION=${stellar(['keys', 'address', admin])}`,
      '',
      'Las llaves secretas quedan en la configuración de Stellar CLI de este equipo.',
      'La del admin es la llave de emergencia: en testnet la guarda la persona responsable (Contrato §6).',
      '',
    ].join('\n'),
  );
}

function instalar() {
  stellar(['contract', 'build'], { cwd: resolve(RAIZ, 'contracts') });
  const hash = stellar([
    'contract',
    'upload',
    '--wasm',
    WASM,
    '--source',
    operador,
    '--network',
    red,
  ]);
  process.stdout.write(`\nSTELLAR_WASM_HASH=${hash}\n`);
  return hash;
}

function probar() {
  const hash = values['wasm-hash'] ?? instalar();
  const idHash = createHash('sha256').update(randomUUID()).digest('hex');
  const ahora = Math.floor(Date.now() / 1000);
  const contrato = stellar([
    'contract',
    'deploy',
    '--wasm-hash',
    hash,
    '--source',
    operador,
    '--network',
    red,
    '--',
    '--admin',
    stellar(['keys', 'address', admin]),
    '--operador',
    stellar(['keys', 'address', operador]),
    '--evento',
    JSON.stringify({ id_hash: idHash, inicio: ahora, fin: ahora + 3600 }),
    '--retos',
    JSON.stringify([
      [1, 10],
      [2, 5],
    ]),
  ]);
  const version = stellar([
    'contract',
    'invoke',
    '--id',
    contrato,
    '--source',
    operador,
    '--network',
    red,
    '--send',
    'no',
    '--',
    'version',
  ]);
  const ultimo = stellar([
    'contract',
    'invoke',
    '--id',
    contrato,
    '--source',
    operador,
    '--network',
    red,
    '--send',
    'no',
    '--',
    'get_ultimo',
  ]);
  process.stdout.write(
    `\nContrato de prueba: ${contrato}\nversion() = ${version}\nget_ultimo() = ${ultimo}\n`,
  );
}

switch (comando) {
  case 'cuentas':
    crearCuentas();
    break;
  case 'instalar':
    instalar();
    break;
  case 'probar':
    probar();
    break;
  default:
    fallar('Comando desconocido. Usa: cuentas, instalar o probar.');
}
