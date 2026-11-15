import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { META_PUBLICA } from '../sesion/sesion';
import { META_PERMISO, META_PLATAFORMA, META_SOLO_SESION, type DefinicionPermiso } from './marcas';

export interface RutaRegistrada {
  readonly metodo: string;
  /** Sin el prefijo global (`/api/v1`), con los parámetros (`/eventos/:eventoId/retos`). */
  readonly ruta: string;
  readonly controlador: string;
  readonly handler: string;
  readonly permiso: DefinicionPermiso | undefined;
  readonly marcas: readonly string[];
}

function join(...partes: (string | string[] | undefined)[]): string {
  const ruta = partes
    .map((p) => (Array.isArray(p) ? (p[0] ?? '') : (p ?? '')))
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0)
    .join('/');
  return `/${ruta}`;
}

/** Todas las rutas HTTP registradas, con sus marcas de acceso (HU-204 §2). */
export function listRutas(app: INestApplication): RutaRegistrada[] {
  const descubrimiento = app.get(DiscoveryService);
  const reflector = app.get(Reflector);
  const rutas: RutaRegistrada[] = [];
  for (const envoltorio of descubrimiento.getControllers()) {
    const clase = envoltorio.metatype as (new (...args: never[]) => unknown) | undefined;
    if (!clase) {
      continue;
    }
    const prototipo = clase.prototype as Record<string, unknown>;
    const base = Reflect.getMetadata(PATH_METADATA, clase) as string | string[] | undefined;
    for (const nombre of Object.getOwnPropertyNames(prototipo)) {
      const handler = prototipo[nombre];
      if (nombre === 'constructor' || typeof handler !== 'function') {
        continue;
      }
      const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (metodo === undefined) {
        continue;
      }
      const objetivos = [handler, clase];
      // La marca del método reemplaza a la de la clase (`@SoloSesion` en la clase y `@Publica`
      // en `login`).
      const todas = [META_PUBLICA, META_SOLO_SESION, META_PERMISO, META_PLATAFORMA];
      const delMetodo = todas.filter((m) => Reflect.getMetadata(m, handler) !== undefined);
      const marcas =
        delMetodo.length > 0
          ? delMetodo
          : todas.filter((m) => Reflect.getMetadata(m, clase) !== undefined);
      rutas.push({
        metodo: RequestMethod[metodo],
        ruta: join(base, Reflect.getMetadata(PATH_METADATA, handler) as string | undefined),
        controlador: clase.name,
        handler: nombre,
        permiso: reflector.getAllAndOverride<DefinicionPermiso | undefined>(
          META_PERMISO,
          objetivos,
        ),
        marcas,
      });
    }
  }
  return rutas;
}

/**
 * **Toda ruta tiene una marca de acceso**: `@Publica`, `@SoloSesion`, `@Permiso` o `@Plataforma`
 * (HU-204 §2). Se corre al arrancar en desarrollo y en los tests: una ruta sin marca no arranca.
 */
export function checkMarcasDeRutas(app: INestApplication): void {
  const problemas = listRutas(app)
    .filter((r) => r.marcas.length !== 1)
    .map(
      (r) =>
        `${r.metodo} ${r.ruta} (${r.controlador}.${r.handler}): ${
          r.marcas.length === 0 ? 'sin marca de acceso' : `varias marcas: ${r.marcas.join(', ')}`
        }`,
    );
  if (problemas.length > 0) {
    throw new Error(`Rutas sin una sola marca de acceso (HU-204):\n${problemas.join('\n')}`);
  }
}
