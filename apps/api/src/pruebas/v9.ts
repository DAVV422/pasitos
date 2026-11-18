import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { canDo, type RolEvento } from '@pasitos/dominio';
import type { RecursoEvento } from '../common/permisos/marcas';
import { listRutas, type RutaRegistrada } from '../common/permisos/rutas';

/**
 * V9 generada (HU-204): recorre **cada ruta registrada** con `@Permiso` y la llama con cada actor.
 * Una ruta nueva entra sola en la prueba. Quien llama da los ids de los recursos del evento A.
 */
export interface ActorV9 {
  readonly nombre: string;
  readonly cookie: string;
  /** `null`: sin rol en el evento A (no es miembro, o es miembro de otro evento). */
  readonly rol: RolEvento | null;
}

export interface FixturesV9 {
  readonly eventoId: string;
  /** Id de un recurso del evento A por tabla (`retos`, `pantallas`…). */
  readonly recursos: Partial<Record<RecursoEvento, string>>;
  /** Para las rutas con `:id` propio de otro parámetro. */
  readonly parametros?: Readonly<Record<string, string>>;
  /**
   * Para las rutas `DELETE`: un recurso nuevo por actor, porque el primero que puede lo borra y los
   * siguientes recibirían 404 por eso y no por su rol.
   */
  readonly recrear?: (recurso: RecursoEvento) => Promise<string>;
}

export interface ResultadoV9 {
  readonly ruta: string;
  readonly actor: string;
  readonly esperado: 'pasa' | 'SIN_PERMISO' | 'NO_ENCONTRADO';
  readonly obtenido: string;
}

async function buildUrlParaActor(ruta: RutaRegistrada, fixtures: FixturesV9): Promise<string> {
  const recurso = ruta.permiso?.recurso;
  if (ruta.metodo === 'DELETE' && recurso && fixtures.recrear) {
    const nuevo = await fixtures.recrear(recurso);
    return buildUrl(ruta, { ...fixtures, recursos: { ...fixtures.recursos, [recurso]: nuevo } });
  }
  return buildUrl(ruta, fixtures);
}

function buildUrl(ruta: RutaRegistrada, fixtures: FixturesV9): string {
  return `/api/v1${ruta.ruta.replace(/:(\w+)/g, (_, nombre: string) => {
    if (nombre === 'eventoId') {
      return fixtures.eventoId;
    }
    const recurso = ruta.permiso?.recurso;
    const desdeRecurso =
      recurso && nombre === (ruta.permiso?.param ?? 'id') ? fixtures.recursos[recurso] : undefined;
    const valor = desdeRecurso ?? fixtures.parametros?.[nombre];
    if (!valor) {
      throw new Error(`V9: falta un valor para :${nombre} en ${ruta.metodo} ${ruta.ruta}`);
    }
    return valor;
  })}`;
}

function getEsperado(ruta: RutaRegistrada, actor: ActorV9): ResultadoV9['esperado'] {
  const accion = ruta.permiso?.accion;
  if (!accion || actor.rol === null) {
    return 'NO_ENCONTRADO';
  }
  if (!canDo(actor.rol, accion)) {
    return 'SIN_PERMISO';
  }
  return 'pasa';
}

/** Lo que pasó con la request: el código del error del guard, o `pasa`. */
function toObtenido(status: number, cuerpo: { code?: string } | undefined): string {
  const code = cuerpo?.code;
  if (code === 'SIN_PERMISO' || code === 'NO_ENCONTRADO') {
    return code;
  }
  return status === 401 ? `401 ${code ?? ''}` : 'pasa';
}

export async function runV9(
  app: NestFastifyApplication,
  actores: readonly ActorV9[],
  fixtures: FixturesV9,
): Promise<{ resultados: ResultadoV9[]; rutas: number }> {
  const rutas = listRutas(app).filter((r) => r.permiso);
  const resultados: ResultadoV9[] = [];
  for (const ruta of rutas) {
    for (const actor of actores) {
      const url = await buildUrlParaActor(ruta, fixtures);
      const { status, cuerpo } = ruta.ruta.endsWith('/en-vivo')
        ? await injectEnVivo(app, url, actor.cookie)
        : await injectComun(app, ruta, url, actor.cookie);
      resultados.push({
        ruta: `${ruta.metodo} ${ruta.ruta}`,
        actor: actor.nombre,
        esperado: getEsperado(ruta, actor),
        obtenido: toObtenido(status, cuerpo),
      });
    }
  }
  return { resultados, rutas: rutas.length };
}

interface Respuesta {
  readonly status: number;
  readonly cuerpo: { code?: string } | undefined;
}

async function injectComun(
  app: NestFastifyApplication,
  ruta: RutaRegistrada,
  url: string,
  cookie: string,
): Promise<Respuesta> {
  const respuesta = await app.inject({
    method: ruta.metodo as 'GET',
    url,
    headers: { cookie },
    ...(ruta.metodo === 'GET' || ruta.metodo === 'DELETE' ? {} : { payload: {} }),
  });
  try {
    return { status: respuesta.statusCode, cuerpo: respuesta.json<{ code?: string }>() };
  } catch {
    return { status: respuesta.statusCode, cuerpo: undefined };
  }
}

/**
 * Los canales en vivo (T-301) no terminan nunca: se piden como stream, que resuelve al mandar los
 * headers. Un error del guard llega como JSON y se lee entero; el canal abierto se corta.
 */
async function injectEnVivo(
  app: NestFastifyApplication,
  url: string,
  cookie: string,
): Promise<Respuesta> {
  const respuesta = await app.inject({
    method: 'GET',
    url,
    headers: { cookie },
    payloadAsStream: true,
  });
  const flujo = respuesta.stream();
  if (String(respuesta.headers['content-type'] ?? '').includes('text/event-stream')) {
    flujo.destroy();
    return { status: respuesta.statusCode, cuerpo: undefined };
  }
  let texto = '';
  for await (const parte of flujo) texto += String(parte);
  try {
    return { status: respuesta.statusCode, cuerpo: JSON.parse(texto) as { code?: string } };
  } catch {
    return { status: respuesta.statusCode, cuerpo: undefined };
  }
}
