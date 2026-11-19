#!/usr/bin/env node
/**
 * Pasitos · arma el HTML de los términos y la política de privacidad (HU-407) desde los
 * documentos aprobados de docs/05-seguridad-legal, y lo deja en
 * libs/dominio/src/legal/documentos.generado.ts. Toma solo la parte publicable: sin el encabezado
 * interno, sin los textos cortos de la app y sin el anexo. Las marcas entre llaves (`{correoContacto}`)
 * quedan para que las complete `libs/dominio/src/legal/config.ts` al mostrar la página.
 *
 * Uso: pnpm legal            (regenera el archivo)
 *      pnpm legal --check    (falla si el archivo no coincide con los documentos; lo corre `verificar`)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Marked } from 'marked';
import * as prettier from 'prettier';

const RAIZ = resolve(import.meta.dirname, '..');
const SALIDA = resolve(RAIZ, 'libs/dominio/src/legal/documentos.generado.ts');
const DOCUMENTOS = {
  terminos: { archivo: '03-terminos-y-condiciones.md', ruta: '/terminos', fin: '## Textos cortos' },
  privacidad: { archivo: '04-politica-de-privacidad.md', ruta: '/privacidad', fin: '## Anexo' },
};
const RUTA_DE = Object.fromEntries(Object.values(DOCUMENTOS).map((d) => [d.archivo, d.ruta]));
const MARCAS = new Set(['correoContacto', 'correoPrivacidad', 'sitio', 'vigenteDesde']);

/** El id de cada título, como los arma GitHub: así sirven los mismos enlaces que en los documentos. */
export function toAncla(texto) {
  return texto
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function buildDocumento(tipo, { archivo, ruta, fin }) {
  const md = readFileSync(resolve(RAIZ, 'docs/05-seguridad-legal', archivo), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const titulo = md.match(/^# (.+)$/m)?.[1];
  const version = md.match(/^\*\*Versión:\*\* ([^·]+?) ·/m)?.[1];
  const inicio = md.indexOf('\n**Versión:**');
  const corte = md.indexOf(`\n${fin}`);
  if (!titulo || !version || inicio < 0 || corte < 0) {
    throw new Error(`${archivo}: no encuentro el título, la versión o dónde termina lo publicable`);
  }
  const cuerpo = md
    .slice(md.indexOf('\n', inicio + 1), corte)
    .replace(/\n---\s*$/, '')
    .trim();
  if (cuerpo.includes('[Completar'))
    throw new Error(`${archivo}: queda un [Completar] en lo publicable`);

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        return `<h${depth} id="${toAncla(html)}">${html}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        const texto = this.parser.parseInline(tokens);
        const [destino, ancla] = href.split('#');
        if (!destino) return `<a href="${ruta}#${ancla}">${texto}</a>`;
        if (RUTA_DE[destino])
          return `<a href="${RUTA_DE[destino]}${ancla ? `#${ancla}` : ''}">${texto}</a>`;
        if (/^https?:\/\//.test(href)) return `<a href="${href}" rel="noopener">${texto}</a>`;
        return texto; // Otro documento interno: queda el texto, sin enlace.
      },
    },
  });
  const html = marked.parse(cuerpo);
  for (const [, marca] of html.matchAll(/\{([a-zA-Z]+)\}/g)) {
    if (!MARCAS.has(marca)) throw new Error(`${archivo}: marca desconocida {${marca}}`);
  }
  return { tipo, titulo, version, html };
}

const documentos = Object.entries(DOCUMENTOS).map(([tipo, d]) => buildDocumento(tipo, d));
const fuente = `// Generado por tools/legal.mjs desde docs/05-seguridad-legal. No editar a mano: \`pnpm legal\`.

/** Los términos y la política de privacidad, en HTML, con las marcas de \`CONFIG_LEGAL\` sin completar. */
export const DOCUMENTOS_LEGALES = {
${documentos
  .map(
    (d) =>
      `  ${d.tipo}: { titulo: ${JSON.stringify(d.titulo)}, version: ${JSON.stringify(d.version)}, html: ${JSON.stringify(d.html)} },`,
  )
  .join('\n')}
} as const;
`;
const formateado = await prettier.format(fuente, {
  ...(await prettier.resolveConfig(SALIDA)),
  filepath: SALIDA,
});

if (process.argv.includes('--check')) {
  const actual = existsSync(SALIDA) ? readFileSync(SALIDA, 'utf8').replace(/\r\n/g, '\n') : '';
  if (actual !== formateado) {
    process.stderr.write(
      'Los términos o la privacidad cambiaron y la página no. Corre `pnpm legal` y commitea el resultado.\n',
    );
    process.exit(1);
  }
  process.stdout.write('Términos y privacidad al día.\n');
} else {
  writeFileSync(SALIDA, formateado);
  process.stdout.write(`Listo: ${SALIDA}\n`);
}
