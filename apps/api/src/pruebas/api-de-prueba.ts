import { VERIFICADOR_TURNSTILE, type VerificadorTurnstile } from '../modules/publico/turnstile';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import type { Type } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { miembrosOrganizacion, organizaciones, usuarios } from '@pasitos/db';
import type { BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../app.module';
import { checkMarcasDeRutas } from '../common/permisos/rutas';
import { TRAER_MAPA } from '../modules/archivos/archivos.module';
import { loadAppConfig } from '../config/app.config';
import { hashPassword } from '../modules/auth/password';
import {
  PASSWORDS_FILTRADAS,
  type PasswordsFiltradasPort,
} from '../modules/auth/passwords-filtradas';
import { COOKIE_EQUIPO, RELOJ, type Reloj } from '../modules/auth/sesiones.service';

/** Reloj que el test mueve a mano. */
export class RelojDePrueba implements Reloj {
  constructor(private actual = new Date('2026-11-15T15:00:00Z')) {}
  now(): Date {
    return this.actual;
  }
  advance(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

/** Contraseñas filtradas a mano: las que estén en la lista. */
export class FiltradasDePrueba implements PasswordsFiltradasPort {
  readonly filtradas = new Set<string>();
  isFiltrada(password: string): Promise<boolean | null> {
    return Promise.resolve(this.filtradas.has(password));
  }
}

export interface ApiDePrueba {
  readonly app: NestFastifyApplication;
  readonly reloj: RelojDePrueba;
  readonly filtradas: FiltradasDePrueba;
  close(): Promise<void>;
}

/** El API completo (AppModule) contra la base de prueba, con reloj y HIBP falsos. */
export async function startApiDePrueba(
  base: BaseDePrueba,
  opciones: {
    controladores?: Type[];
    destinoLogs?: NodeJS.WritableStream;
    archivosDir?: string;
    /** Variables de configuración que cambian para un test. */
    config?: Readonly<Record<string, string>>;
    traerMapa?: (lat: number, lng: number) => Promise<Buffer | null>;
    /** HU-410: un Turnstile falso (sin la red); sin esto, el que diga la configuración. */
    turnstile?: VerificadorTurnstile | null;
  } = {},
): Promise<ApiDePrueba> {
  const reloj = new RelojDePrueba();
  const filtradas = new FiltradasDePrueba();
  const config = loadAppConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: opciones.destinoLogs ? 'debug' : 'fatal',
    DATABASE_URL_APP: base.urls.app,
    DATABASE_URL_SISTEMA: base.urls.sistema,
    LLAVE_CIFRADO_DATOS: Buffer.alloc(32, 7).toString('base64'),
    PUBLIC_URL: 'http://localhost:8080',
    HIBP_ACTIVO: 'false',
    ...(opciones.archivosDir ? { ARCHIVOS_DIR: opciones.archivosDir } : {}),
    ...opciones.config,
  });
  let constructor = Test.createTestingModule({
    imports: [
      AppModule.forConfig(
        config,
        opciones.destinoLogs ? { destinoLogs: opciones.destinoLogs } : {},
      ),
    ],
    controllers: opciones.controladores ?? [],
  })
    .overrideProvider(RELOJ)
    .useValue(reloj)
    .overrideProvider(PASSWORDS_FILTRADAS)
    .useValue(filtradas)
    .overrideProvider(TRAER_MAPA)
    .useValue(opciones.traerMapa ?? (() => Promise.resolve(null)));
  if (opciones.turnstile !== undefined) {
    constructor = constructor.overrideProvider(VERIFICADOR_TURNSTILE).useValue(opciones.turnstile);
  }
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    rawBody: true,
    logger: false,
  });
  if (opciones.destinoLogs) {
    // Los logs de los servicios (Logger de Nest) también van a pino, como en main.ts.
    app.useLogger(app.get(Logger));
  }
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 5 },
  });
  app.setGlobalPrefix('api/v1');
  await app.init();
  checkMarcasDeRutas(app);
  await app.getHttpAdapter().getInstance().ready();
  return { app, reloj, filtradas, close: () => app.close() };
}

/** Crea una persona del equipo con contraseña. Con `dueno`, además la hace dueña de una organización. */
export async function seedUsuario(
  base: BaseDePrueba,
  opciones: { email: string; password: string; nombre?: string; dueno?: boolean },
): Promise<string> {
  const id = uuidv7();
  await base.sistema.db.insert(usuarios).values({
    id,
    email: opciones.email,
    nombre: opciones.nombre ?? 'Persona de prueba',
    passwordHash: await hashPassword(opciones.password),
    emailVerificadoAt: new Date(),
  });
  if (opciones.dueno) {
    const organizacionId = uuidv7();
    await base.sistema.db
      .insert(organizaciones)
      .values({ id: organizacionId, nombre: 'Org de prueba', slug: `org-${organizacionId}` });
    await base.sistema.db
      .insert(miembrosOrganizacion)
      .values({ id: uuidv7(), organizacionId, usuarioId: id, rol: 'dueno' });
  }
  return id;
}

/** La cookie de sesión de una respuesta, lista para el header `cookie`. */
export function getCookieSesion(respuesta: { cookies: { name: string; value: string }[] }) {
  const cookie = respuesta.cookies.find((c) => c.name === COOKIE_EQUIPO);
  return cookie ? `${COOKIE_EQUIPO}=${cookie.value}` : undefined;
}
