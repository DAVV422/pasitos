#!/usr/bin/env node
/**
 * Pasitos · servidor local con las mismas rutas que producción (D49, Infraestructura §4.3).
 * Hace el papel de Caddy en la computadora: un solo origen con
 *   /api/*                          → API (puerto 3000)
 *   /app/, /sala/, /mesa/,
 *   /admin/, /plataforma/           → build de cada app, con fallback a su index.html
 *   /v/:codigo, /r/:qr              → redirecciones a /app
 *   el resto                        → sitio público SSR (puerto 4000)
 *
 * Uso (después de `nx run-many -t build`): node tools/servidor-local.mjs   → http://localhost:8080
 * No se usa en producción: allí está Caddy (T-002).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const PUERTO = Number(process.env.PUERTO_LOCAL ?? 8080);
const API = process.env.API_URL ?? 'http://127.0.0.1:3000';
const SITIO = process.env.SITIO_URL ?? 'http://127.0.0.1:4000';
const DIST = resolve(import.meta.dirname, '../dist/apps');
const APPS = ['app', 'sala', 'mesa', 'admin', 'plataforma'];

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Headers de seguridad básicos, como en producción (Infraestructura §4.4). */
function aplicarHeaders(respuesta) {
  respuesta.setHeader('X-Content-Type-Options', 'nosniff');
  respuesta.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function servirArchivo(respuesta, ruta) {
  respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream' });
  createReadStream(ruta).pipe(respuesta);
}

function servirApp(app, rutaRelativa, respuesta) {
  const carpeta = join(DIST, app, 'browser');
  const pedido = normalize(join(carpeta, rutaRelativa));
  if (!pedido.startsWith(carpeta)) {
    respuesta.writeHead(400).end();
    return;
  }
  if (existsSync(pedido) && statSync(pedido).isFile()) {
    servirArchivo(respuesta, pedido);
    return;
  }
  const indice = join(carpeta, 'index.html');
  if (!existsSync(indice)) {
    respuesta.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end(`Falta el build de ${app}: corre "nx build ${app}".`);
    return;
  }
  servirArchivo(respuesta, indice);
}

async function reenviar(destino, pedido, respuesta) {
  try {
    const cuerpo = ['GET', 'HEAD'].includes(pedido.method ?? 'GET') ? undefined : pedido;
    const resultado = await fetch(`${destino}${pedido.url}`, {
      method: pedido.method,
      headers: { ...pedido.headers, host: new URL(destino).host },
      body: cuerpo,
      duplex: 'half',
      redirect: 'manual',
    });
    const headers = Object.fromEntries(resultado.headers.entries());
    delete headers['content-encoding'];
    delete headers['content-length'];
    respuesta.writeHead(resultado.status, headers);
    respuesta.end(Buffer.from(await resultado.arrayBuffer()));
  } catch {
    respuesta.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end(`No responde ${destino}.`);
  }
}

const servidor = createServer((pedido, respuesta) => {
  aplicarHeaders(respuesta);
  const url = new URL(pedido.url ?? '/', 'http://localhost');
  const [, primero = '', ...resto] = url.pathname.split('/');

  if (primero === 'api') return void reenviar(API, pedido, respuesta);
  if (primero === 'v' && resto[0]) {
    respuesta.writeHead(302, { Location: `/app/acceso/corto/${resto[0]}` }).end();
    return;
  }
  if (primero === 'r' && resto[0]) {
    respuesta.writeHead(302, { Location: `/app/r/${resto.join('/')}` }).end();
    return;
  }
  if (APPS.includes(primero)) {
    if (url.pathname === `/${primero}`) {
      respuesta.writeHead(301, { Location: `/${primero}/` }).end();
      return;
    }
    return void servirApp(primero, resto.join('/'), respuesta);
  }
  return void reenviar(SITIO, pedido, respuesta);
});

servidor.listen(PUERTO, () => {
  process.stdout.write(`Pasitos local en http://localhost:${PUERTO}\n`);
});
