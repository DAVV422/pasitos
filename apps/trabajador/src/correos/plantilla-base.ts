import mjml2html from 'mjml';
import { COMUN_CORREOS, escapeHtml, type ContenidoCorreo } from '@pasitos/dominio/correos';

/**
 * La única plantilla de correo (T-007 §4): tema claro, un título, los párrafos, un solo botón con el
 * enlace también escrito, y el pie. Cada correo se arma desde el catálogo; no hay una plantilla por
 * correo. Colores de los tokens de @pasitos/ui (los correos no admiten variables de CSS).
 */
const COLORES = {
  fondo: '#f8fafc',
  superficie: '#ffffff',
  texto: '#0b0f19',
  apagado: '#475569',
  linea: '#cbd5e1',
  boton: '#b45309',
  botonTexto: '#ffffff',
} as const;

const FUENTE = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface CorreoArmado {
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

export async function renderCorreo(contenido: ContenidoCorreo): Promise<CorreoArmado> {
  const parrafos = contenido.parrafos
    .map((p) => `<mj-text padding="0 0 14px 0">${p.html}</mj-text>`)
    .join('\n');
  const boton = contenido.boton
    ? `<mj-button href="${escapeHtml(contenido.boton.enlace)}" background-color="${COLORES.boton}"
         color="${COLORES.botonTexto}" font-weight="600" border-radius="10px" inner-padding="14px 24px"
         padding="10px 0 18px 0" align="left">${escapeHtml(contenido.boton.texto)}</mj-button>
       <mj-text color="${COLORES.apagado}" font-size="13px" padding="0 0 6px 0">${escapeHtml(COMUN_CORREOS.textoEnlace)}</mj-text>
       <mj-text color="${COLORES.apagado}" font-size="13px" padding="0 0 14px 0"><a href="${escapeHtml(contenido.boton.enlace)}" style="color:${COLORES.texto};word-break:break-all">${escapeHtml(contenido.boton.enlace)}</a></mj-text>`
    : '';
  const bajoBoton = contenido.bajoBoton
    ? `<mj-text color="${COLORES.apagado}" font-size="13px" padding="0 0 14px 0">${contenido.bajoBoton.html}</mj-text>`
    : '';

  const fuente = `<mjml lang="es">
  <mj-head>
    <mj-title>${escapeHtml(contenido.asunto)}</mj-title>
    <mj-preview>${escapeHtml(contenido.parrafos[1]?.texto ?? contenido.asunto)}</mj-preview>
    <mj-attributes>
      <mj-all font-family="${FUENTE}" />
      <mj-text font-size="16px" line-height="1.5" color="${COLORES.texto}" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${COLORES.fondo}" width="560px">
    <mj-section padding="24px 16px 8px 16px">
      <mj-column>
        <mj-text font-size="20px" font-weight="700" padding="0">${escapeHtml(COMUN_CORREOS.remitenteNombre)}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="${COLORES.superficie}" border="1px solid ${COLORES.linea}" border-radius="14px" padding="24px 20px">
      <mj-column>
        ${parrafos}
        ${boton}
        ${bajoBoton}
      </mj-column>
    </mj-section>
    <mj-section padding="16px">
      <mj-column>
        <mj-text color="${COLORES.apagado}" font-size="12px" padding="0 0 4px 0">${contenido.pie.html}</mj-text>
        <mj-text color="${COLORES.apagado}" font-size="12px" padding="0">${escapeHtml(COMUN_CORREOS.eslogan)}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

  const resultado = await mjml2html(fuente, { validationLevel: 'strict' });
  if (resultado.errors.length > 0) {
    throw new Error(`La plantilla del correo ${contenido.tipo} no es válida`);
  }
  return { asunto: contenido.asunto, html: resultado.html, texto: renderTexto(contenido) };
}

/** Versión en texto plano: los mismos párrafos, el enlace escrito y el pie. */
export function renderTexto(contenido: ContenidoCorreo): string {
  const partes = contenido.parrafos.map((p) => p.texto);
  if (contenido.boton) {
    partes.push(`${contenido.boton.texto}: ${contenido.boton.enlace}`);
  }
  if (contenido.bajoBoton) {
    partes.push(contenido.bajoBoton.texto);
  }
  partes.push('—', contenido.pie.texto, COMUN_CORREOS.eslogan);
  return `${partes.join('\n\n')}\n`;
}
