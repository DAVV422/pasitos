import { CORREOS, type DatosCorreo, type DefinicionCorreo, type TipoCorreo } from './catalogo';

/** Un texto ya armado, en HTML (escapado, con `<strong>`) y en texto plano. */
export interface Fragmento {
  readonly html: string;
  readonly texto: string;
}

/** El correo armado desde el catálogo, listo para la plantilla base. */
export interface ContenidoCorreo {
  readonly tipo: TipoCorreo;
  readonly prioridad: DefinicionCorreo['prioridad'];
  readonly asunto: string;
  readonly parrafos: readonly Fragmento[];
  readonly boton?: { readonly texto: string; readonly enlace: string };
  readonly bajoBoton?: Fragmento;
  readonly pie: Fragmento;
}

const VARIABLE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const OPCIONAL = /\[([^\]]*)\]/g;
const NEGRITA = /\*\*(.+?)\*\*/g;

export class VariableFaltanteError extends Error {
  constructor(
    readonly tipo: string,
    readonly variable: string,
  ) {
    super(`Al correo ${tipo} le falta la variable {${variable}}`);
    this.name = 'VariableFaltanteError';
  }
}

export function escapeHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Arma un correo del catálogo con sus datos. `datosSistema` son los de la configuración del
 * trabajador (`correoSoporte`). Lanza `VariableFaltanteError` si falta un dato obligatorio.
 */
export function buildContenidoCorreo<T extends TipoCorreo>(
  tipo: T,
  datos: DatosCorreo<T>,
  datosSistema: Readonly<Record<string, string>> = {},
): ContenidoCorreo {
  const definicion: DefinicionCorreo = CORREOS[tipo];
  const valores: Readonly<Record<string, string | undefined>> = { ...datosSistema, ...datos };
  const armar = (texto: string) => buildFragmento(tipo, texto, valores);

  const contenido: ContenidoCorreo = {
    tipo,
    prioridad: definicion.prioridad,
    asunto: armar(definicion.asunto).texto,
    parrafos: definicion.parrafos.map(armar),
    pie: armar(definicion.pie),
    ...(definicion.bajoBoton ? { bajoBoton: armar(definicion.bajoBoton) } : {}),
  };
  if (!definicion.boton) {
    return contenido;
  }
  const enlace = armar(definicion.boton.enlace).texto;
  // Solo enlaces web: un dato mal cargado no puede volverse `javascript:` en un botón.
  if (!/^https?:\/\/[^\s]+$/.test(enlace)) {
    throw new Error(`El enlace del correo ${tipo} no es una dirección web válida`);
  }
  return { ...contenido, boton: { texto: armar(definicion.boton.texto).texto, enlace } };
}

function buildFragmento(
  tipo: string,
  plantilla: string,
  valores: Readonly<Record<string, string | undefined>>,
): Fragmento {
  const tieneValor = (variable: string) => (valores[variable] ?? '').trim().length > 0;
  // 1. Partes opcionales: quedan solo si todas sus variables tienen valor.
  const sinOpcionales = plantilla.replace(OPCIONAL, (_, dentro: string) =>
    [...dentro.matchAll(VARIABLE)].every(([, variable]) => tieneValor(variable ?? ''))
      ? dentro
      : '',
  );
  const valor = (variable: string) => {
    if (!tieneValor(variable)) {
      throw new VariableFaltanteError(tipo, variable);
    }
    return (valores[variable] ?? '').trim();
  };
  // 2. HTML: se escapa la plantilla, se marca la negrita y recién entonces se ponen los datos
  //    (escapados), así un dato con `**` o `<` no cambia el formato.
  const html = escapeHtml(sinOpcionales)
    .replace(NEGRITA, '<strong>$1</strong>')
    .replace(VARIABLE, (_, variable: string) => escapeHtml(valor(variable)));
  const texto = sinOpcionales
    .replace(NEGRITA, '$1')
    .replace(VARIABLE, (_, variable: string) => valor(variable));
  return { html, texto };
}
