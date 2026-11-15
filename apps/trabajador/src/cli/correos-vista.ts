/**
 * Manda un ejemplo de cada correo del catálogo, para revisar los textos y la plantilla (T-007a).
 * En desarrollo van a Mailpit: ábrelo en http://localhost:8025. No pasa por la cola ni gasta cupo.
 *
 *   pnpm correos:vista [--para vista@example.com] [--tipo invitacion_evento]
 */
import { parseArgs } from 'node:util';
import {
  buildContenidoCorreo,
  EJEMPLOS_CORREO,
  TIPOS_CORREO,
  type TipoCorreo,
} from '@pasitos/dominio/correos';
import { buildCorreoPort } from '../composicion';
import { loadTrabajadorConfig } from '../config/trabajador.config';
import { renderCorreo } from '../correos/plantilla-base';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { para: { type: 'string' }, tipo: { type: 'string' } },
  });
  const config = loadTrabajadorConfig();
  const para = values.para ?? 'vista@example.com';
  if (values.tipo && !TIPOS_CORREO.includes(values.tipo as TipoCorreo)) {
    throw new Error(`Tipo desconocido. Tipos: ${TIPOS_CORREO.join(', ')}`);
  }
  const tipos = values.tipo ? [values.tipo as TipoCorreo] : TIPOS_CORREO;
  const proveedor = buildCorreoPort(config);

  for (const tipo of tipos) {
    const contenido = buildContenidoCorreo(tipo, EJEMPLOS_CORREO[tipo] as never, {
      correoSoporte: config.CORREO_SOPORTE,
    });
    const correo = await renderCorreo(contenido);
    await proveedor.send({
      de: config.CORREO_REMITENTE,
      para,
      ...correo,
      etiquetas: { Tipo: tipo, Envio: 'vista' },
    });
    process.stdout.write(`✓ ${tipo}: ${correo.asunto}\n`);
  }
  process.stdout.write(
    config.CORREO_ADAPTADOR === 'smtp'
      ? 'Míralos en Mailpit: http://localhost:8025\n'
      : `Guardados en ${config.CORREOS_DIR}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
