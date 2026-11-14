/**
 * Verificación del Hito A (HU-105 §3): recalcula todas las huellas de un evento desde los movimientos y las
 * compara con el contrato. Solo lee. Sale con código 1 si algo no coincide.
 *
 *   pnpm stellar:verificar --evento <slug>                    # contra la red
 *   pnpm stellar:verificar --evento <slug> --evidencia <json> # contra evidencia-stellar.json, sin red
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createConexion } from '@pasitos/db';
import { buildComposicion } from '../composicion';
import { loadTrabajadorConfig } from '../config/trabajador.config';
import { parseEvidencia } from '../evidencia/evidencia';
import { SelladorRepository } from '../sellador/sellador.repository';
import {
  formatVerificacion,
  readEstadoDeEvidencia,
  readEstadoDeRed,
  VerificacionService,
  type EstadoVerificable,
} from '../verificacion/verificacion.service';

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { evento: { type: 'string' }, evidencia: { type: 'string' } },
  });
  if (!values.evento) {
    throw new Error('Uso: pnpm stellar:verificar --evento <slug> [--evidencia <archivo>]');
  }
  const config = loadTrabajadorConfig();
  // Con la evidencia no hace falta la red, ni la llave del operador.
  const evidencia = values.evidencia
    ? parseEvidencia(readFileSync(values.evidencia, 'utf-8'))
    : null;
  const composicion = evidencia ? null : buildComposicion(config);
  const conexion = composicion?.conexion ?? createConexion(config.DATABASE_URL_SISTEMA, { max: 2 });
  try {
    const repositorio = new SelladorRepository(conexion.db);
    const eventoId = await repositorio.findEventoIdBySlug(values.evento);
    if (!eventoId) {
      throw new Error(`No existe el evento "${values.evento}"`);
    }
    let estado: EstadoVerificable;
    if (evidencia) {
      estado = readEstadoDeEvidencia(evidencia);
    } else {
      const evento = await repositorio.getEvento(eventoId);
      if (!evento?.contratoId || !composicion) {
        throw new Error('El evento todavía no tiene contrato');
      }
      estado = await readEstadoDeRed(
        composicion.stellar,
        evento.contratoId,
        await repositorio.listNumerosRetosRegistrados(eventoId),
      );
    }
    const resultado = await new VerificacionService(repositorio).verifyEvento(eventoId, estado);
    process.stdout.write(formatVerificacion(resultado));
    return resultado.coincide ? 0 : 1;
  } finally {
    await conexion.pool.end();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error: unknown) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
