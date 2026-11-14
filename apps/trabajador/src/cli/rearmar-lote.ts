/**
 * Rearma un lote rechazado con los mismos movimientos, después de corregir el error del servidor
 * (HU-103 §5). Queda en la bitácora de plataforma. Lo corre una persona de Pasitos.
 *
 *   pnpm sellador:rearmar --evento <slug> --lote <n> --motivo "Qué se corrigió"
 */
import { parseArgs } from 'node:util';
import { buildComposicion } from '../composicion';
import { loadTrabajadorConfig } from '../config/trabajador.config';
import { SelladorRepository } from '../sellador/sellador.repository';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { evento: { type: 'string' }, lote: { type: 'string' }, motivo: { type: 'string' } },
  });
  const numero = Number(values.lote);
  if (!values.evento || !Number.isInteger(numero) || numero < 1 || !values.motivo?.trim()) {
    throw new Error('Uso: pnpm sellador:rearmar --evento <slug> --lote <n> --motivo "…"');
  }
  const composicion = buildComposicion(loadTrabajadorConfig());
  try {
    const eventoId = await new SelladorRepository(composicion.conexion.db).findEventoIdBySlug(
      values.evento,
    );
    if (!eventoId) {
      throw new Error(`No existe el evento "${values.evento}"`);
    }
    await composicion.sellador.rearmLote(eventoId, numero, values.motivo.trim());
    process.stdout.write(`Lote ${numero} rearmado. El sellador lo envía en el próximo ciclo.\n`);
  } finally {
    await composicion.conexion.pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
