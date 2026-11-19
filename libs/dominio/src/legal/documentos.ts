import { CONFIG_LEGAL, type ConfigLegal } from './config';
import { DOCUMENTOS_LEGALES } from './documentos.generado';

export type TipoDocumentoLegal = keyof typeof DOCUMENTOS_LEGALES;

export interface DocumentoLegal {
  readonly tipo: TipoDocumentoLegal;
  readonly titulo: string;
  readonly version: string;
  /** `19/11/2026`. */
  readonly vigenteDesde: string;
  readonly html: string;
}

/** Lo que se muestra en lugar de un correo que todavía no se publicó. */
export const CORREO_POR_PUBLICAR = '(correo por publicar)';

const escapar = (texto: string) =>
  texto.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

function toCorreo(correo: string): string {
  const limpio = correo.trim();
  return limpio
    ? `<a href="mailto:${escapar(limpio)}">${escapar(limpio)}</a>`
    : CORREO_POR_PUBLICAR;
}

/** `2026-11-19` → `19/11/2026`. */
export function formatFechaLegal(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : iso;
}

/**
 * El documento listo para mostrar (HU-407): completa las marcas con `CONFIG_LEGAL`. Los correos
 * salen como enlace `mailto:`; uno vacío, como *"(correo por publicar)"*.
 */
export function getDocumentoLegal(
  tipo: TipoDocumentoLegal,
  config: ConfigLegal = CONFIG_LEGAL,
): DocumentoLegal {
  const documento = DOCUMENTOS_LEGALES[tipo];
  const sitio = config.sitio.trim().replace(/\/$/, '');
  const valores: Readonly<Record<string, string>> = {
    correoContacto: toCorreo(config.correoContacto),
    correoPrivacidad: toCorreo(config.correoPrivacidad),
    sitio: `<a href="${escapar(sitio)}">${escapar(sitio.replace(/^https?:\/\//, ''))}</a>`,
    vigenteDesde: formatFechaLegal(config.vigenteDesde),
  };
  return {
    tipo,
    titulo: documento.titulo,
    version: documento.version,
    vigenteDesde: formatFechaLegal(config.vigenteDesde),
    html: documento.html.replace(
      /\{([a-zA-Z]+)\}/g,
      (marca, nombre: string) => valores[nombre] ?? marca,
    ),
  };
}
