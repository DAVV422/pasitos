import fastifyCookie from '@fastify/cookie';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { miembrosOrganizacion, organizaciones, usuarios } from '@pasitos/db';
import type { BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../app.module';
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
export async function startApiDePrueba(base: BaseDePrueba): Promise<ApiDePrueba> {
  const reloj = new RelojDePrueba();
  const filtradas = new FiltradasDePrueba();
  const config = loadAppConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    DATABASE_URL_APP: base.urls.app,
    DATABASE_URL_SISTEMA: base.urls.sistema,
    LLAVE_CIFRADO_DATOS: Buffer.alloc(32, 7).toString('base64'),
    PUBLIC_URL: 'http://localhost:8080',
    HIBP_ACTIVO: 'false',
  });
  const modulo = await Test.createTestingModule({ imports: [AppModule.forConfig(config)] })
    .overrideProvider(RELOJ)
    .useValue(reloj)
    .overrideProvider(PASSWORDS_FILTRADAS)
    .useValue(filtradas)
    .compile();
  const app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1');
  await app.init();
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
