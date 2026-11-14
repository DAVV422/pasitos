#!/usr/bin/env node
/**
 * Pasitos · control de peso de la carga inicial, COMPRIMIDA con Brotli (T-006 §1).
 *
 * Angular mide sus budgets sin comprimir: sirven como primer aviso. Este script es el control
 * que vale: comprime los archivos que carga cada app al entrar (los que enlaza su index.html)
 * y compara con los límites de Aplicaciones web §0. Sale con código 1 si alguna se pasa.
 *
 * Uso: node tools/peso.mjs [app ...]   (después de `nx run-many -t build`)
 *      node tools/peso.mjs --json      (para el comentario del PR)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

/** Límites en KB comprimidos (Aplicaciones web §0; se ajustan con T-008). */
export const LIMITES = {
  app: { error: 250, aviso: 200 },
  sala: { error: 300, aviso: 250 },
  mesa: { error: 250, aviso: 200 },
  admin: { error: 450, aviso: 400 },
  plataforma: { error: 500, aviso: 450 },
  // Solo JavaScript (el HTML lo genera el servidor).
  sitio: { error: 80, aviso: 60, soloJs: true },
};

const RAIZ = resolve(import.meta.dirname, '..');

function brotli(contenido) {
  return brotliCompressSync(contenido, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}

/** Archivos que el index.html carga al entrar: scripts, estilos y modulepreload. */
function archivosIniciales(html) {
  const archivos = new Set();
  for (const [, ruta] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) archivos.add(ruta);
  for (const [etiqueta, ruta] of html.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)) {
    if (/rel="(stylesheet|modulepreload)"/.test(etiqueta)) archivos.add(ruta);
  }
  return [...archivos].filter((ruta) => !/^https?:/.test(ruta));
}

export function medir(app) {
  const carpeta = join(RAIZ, 'dist/apps', app, 'browser');
  const candidatos = ['index.csr.html', 'index.html'].map((nombre) => join(carpeta, nombre));
  const index = candidatos.find((ruta) => existsSync(ruta));
  if (!index) throw new Error(`No hay build de ${app}: corre "nx build ${app}" primero.`);
  const html = readFileSync(index, 'utf8');
  const limite = LIMITES[app];
  let bytes = 0;
  for (const ruta of archivosIniciales(html)) {
    if (limite.soloJs && !ruta.endsWith('.js')) continue;
    bytes += brotli(readFileSync(join(carpeta, ruta)));
  }
  const kb = Math.round((bytes / 1024) * 10) / 10;
  const estado = kb > limite.error ? 'error' : kb > limite.aviso ? 'aviso' : 'ok';
  return { app, kb, limite: limite.error, aviso: limite.aviso, estado };
}

function main() {
  const argumentos = process.argv.slice(2);
  const comoJson = argumentos.includes('--json');
  const apps = argumentos.filter((a) => !a.startsWith('--'));
  const resultados = (apps.length ? apps : Object.keys(LIMITES)).map(medir);

  if (comoJson) {
    process.stdout.write(`${JSON.stringify(resultados, null, 2)}\n`);
  } else {
    const icono = { ok: '✅', aviso: '⚠️ ', error: '❌' };
    for (const r of resultados) {
      process.stdout.write(
        `${icono[r.estado]} ${r.app.padEnd(11)} ${String(r.kb).padStart(7)} KB  (aviso ${r.aviso} · límite ${r.limite})\n`,
      );
    }
  }
  if (resultados.some((r) => r.estado === 'error')) process.exitCode = 1;
}

if (
  import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('peso.mjs')
) {
  main();
}
