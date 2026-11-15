import {
  eventos,
  miembroTerminales,
  miembrosEvento,
  miembrosOrganizacion,
  organizaciones,
  pantallas,
  retos,
  sessions,
  usuarios,
} from '@pasitos/db';
import type { BaseDePrueba } from '@pasitos/db/pruebas';
import type { RolEvento } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import { createTokenAleatorio } from '../modules/auth/auth.repository';
import { COOKIE_EQUIPO } from '../modules/auth/sesiones.service';

/**
 * Datos de prueba de un evento con su equipo, directo en la base (pasitos_sistema). Las sesiones
 * se crean ya con el segundo factor pasado, para probar permisos sin pasar por el login.
 */
export interface EventoDePrueba {
  readonly organizacionId: string;
  readonly eventoId: string;
  readonly retoId: string;
  readonly pantallaId: string;
}

export async function createEventoDePrueba(
  base: BaseDePrueba,
  opciones: { organizacionId?: string; estado?: string; nombre?: string } = {},
): Promise<EventoDePrueba> {
  const organizacionId = opciones.organizacionId ?? uuidv7();
  if (!opciones.organizacionId) {
    await base.sistema.db
      .insert(organizaciones)
      .values({ id: organizacionId, nombre: 'Org de prueba', slug: `org-${organizacionId}` });
  }
  const eventoId = uuidv7();
  const inicio = new Date('2026-12-01T13:00:00Z');
  await base.sistema.db.insert(eventos).values({
    id: eventoId,
    organizacionId,
    slug: `evento-${eventoId}`,
    nombre: opciones.nombre ?? 'Evento de prueba',
    inicioAt: inicio,
    finAt: new Date(inicio.getTime() + 8 * 3_600_000),
    estado: opciones.estado ?? 'borrador',
  });
  const retoId = uuidv7();
  await base.sistema.db
    .insert(retos)
    .values({ id: retoId, organizacionId, eventoId, nombre: 'Reto', puntos: 10, topeTotal: 100 });
  const pantallaId = uuidv7();
  await base.sistema.db
    .insert(pantallas)
    .values({ id: pantallaId, organizacionId, eventoId, nombre: 'Tablet Sala A' });
  return { organizacionId, eventoId, retoId, pantallaId };
}

export interface PersonaDePrueba {
  readonly usuarioId: string;
  readonly cookie: string;
}

/** Una persona con sesión abierta y segundo factor pasado (TOTP ficticio). */
export async function createPersonaConSesion(
  base: BaseDePrueba,
  nombre: string,
  ahora = new Date('2026-11-15T15:00:00Z'),
): Promise<PersonaDePrueba> {
  const usuarioId = uuidv7();
  await base.sistema.db.insert(usuarios).values({
    id: usuarioId,
    email: `${usuarioId}@example.com`,
    nombre,
    emailVerificadoAt: ahora,
    totpSecretCifrado: Buffer.from('ficticio'),
  });
  const { token, hash } = createTokenAleatorio();
  await base.sistema.db.insert(sessions).values({
    id: uuidv7(),
    tipo: 'usuario',
    usuarioId,
    tokenHash: hash,
    segundoFactorAt: ahora,
    ultimoUsoAt: ahora,
    createdAt: ahora,
    expiraAt: new Date(ahora.getTime() + 7 * 86_400_000),
  });
  return { usuarioId, cookie: `${COOKIE_EQUIPO}=${token}` };
}

/** Le da un rol en el evento: dueño de la organización o miembro activo. */
export async function addRol(
  base: BaseDePrueba,
  evento: EventoDePrueba,
  persona: PersonaDePrueba,
  rol: RolEvento,
  terminales: { pantallas?: string[] } = {},
): Promise<string | null> {
  if (rol === 'dueno') {
    await base.sistema.db.insert(miembrosOrganizacion).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      usuarioId: persona.usuarioId,
      rol: 'dueno',
    });
    return null;
  }
  const miembroId = uuidv7();
  await base.sistema.db.insert(miembrosEvento).values({
    id: miembroId,
    organizacionId: evento.organizacionId,
    eventoId: evento.eventoId,
    usuarioId: persona.usuarioId,
    emailInvitado: `${persona.usuarioId}@example.com`,
    rol,
    estado: 'activo',
    aceptadoAt: new Date(),
  });
  for (const pantallaId of terminales.pantallas ?? []) {
    await base.sistema.db.insert(miembroTerminales).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      miembroEventoId: miembroId,
      pantallaId,
    });
  }
  return miembroId;
}
