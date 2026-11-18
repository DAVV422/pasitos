import {
  actividades,
  alertas,
  asistentes,
  canjes,
  operaciones,
  eventos,
  lugares,
  miembroTerminales,
  miembrosEvento,
  miembrosOrganizacion,
  organizaciones,
  mesas,
  pantallas,
  preguntasFrecuentes,
  premios,
  retos,
  sessions,
  sponsors,
  tokens,
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
  /** Un recurso de cada tabla del evento, para V9 (`recursos`). */
  readonly recursos: {
    readonly retos: string;
    readonly pantallas: string;
    readonly lugares: string;
    readonly actividades: string;
    readonly sponsors: string;
    readonly preguntas: string;
    readonly premios: string;
    readonly mesas: string;
    readonly asistentes: string;
    readonly operaciones: string;
    readonly importaciones: string;
    readonly accesos: string;
    readonly alertas: string;
    readonly canjes: string;
  };
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

  const lugarId = uuidv7();
  await base.sistema.db
    .insert(lugares)
    .values({ id: lugarId, organizacionId, eventoId, tipo: 'sala', nombre: 'Sala A' });
  const pantallaId = uuidv7();
  await base.sistema.db
    .insert(pantallas)
    .values({ id: pantallaId, organizacionId, eventoId, nombre: 'Tablet Sala A', lugarId });
  const mesaId = uuidv7();
  await base.sistema.db
    .insert(mesas)
    .values({ id: mesaId, organizacionId, eventoId, nombre: 'Mesa 1', lugarId });
  const retoId = uuidv7();
  await base.sistema.db.insert(retos).values({
    id: retoId,
    organizacionId,
    eventoId,
    nombre: 'Reto',
    puntos: 10,
    topeTotal: 100,
    lugarId,
  });
  const sponsorId = uuidv7();
  await base.sistema.db
    .insert(sponsors)
    .values({ id: sponsorId, organizacionId, eventoId, nombre: 'Sponsor de prueba' });
  const actividadId = uuidv7();
  await base.sistema.db.insert(actividades).values({
    id: actividadId,
    organizacionId,
    eventoId,
    titulo: 'Charla de apertura',
    inicioAt: inicio,
    finAt: new Date(inicio.getTime() + 3_600_000),
  });
  const preguntaId = uuidv7();
  await base.sistema.db.insert(preguntasFrecuentes).values({
    id: preguntaId,
    organizacionId,
    eventoId,
    pregunta: '¿Hay estacionamiento?',
    respuesta: 'Sí, en el subsuelo.',
  });
  // Oculto: un premio activo sin mesa deja la lista de chequeo incompleta (HU-208).
  const premioId = uuidv7();
  await base.sistema.db.insert(premios).values({
    id: premioId,
    organizacionId,
    eventoId,
    nombre: 'Taza',
    puntos: 50,
    stockTotal: 20,
    estado: 'oculto',
  });
  const asistenteId = uuidv7();
  await base.sistema.db
    .insert(asistentes)
    .values({ id: asistenteId, organizacionId, eventoId, nombre: 'Invitada de prueba' });
  const importacionId = uuidv7();
  const exportacionId = uuidv7();
  await base.sistema.db.insert(operaciones).values([
    {
      id: importacionId,
      tipo: 'import-asistentes',
      organizacionId,
      eventoId,
      expiraAt: new Date('2030-01-01T00:00:00Z'),
    },
    {
      id: exportacionId,
      tipo: 'export-asistentes',
      organizacionId,
      eventoId,
      expiraAt: new Date('2030-01-01T00:00:00Z'),
    },
  ]);
  // HU-302: un QR de asistente ya vencido (el id del acceso es el del token del QR).
  const accesoId = uuidv7();
  await base.sistema.db.insert(tokens).values({
    id: accesoId,
    tokenHash: createTokenAleatorio().hash,
    proposito: 'qr_asistente',
    eventoId,
    refId: asistenteId,
    grupo: accesoId,
    expiraAt: new Date('2026-01-01T00:00:00Z'),
  });
  // HU-316: un cobro de la mesa.
  const canjeId = uuidv7();
  await base.sistema.db.insert(canjes).values({
    id: canjeId,
    organizacionId,
    eventoId,
    mesaId,
    tokenHash: createTokenAleatorio().hash,
    comprobante: 'C-0001',
    totalPuntos: 50,
    expiraAt: new Date('2026-01-01T00:00:00Z'),
  });
  // HU-305: un aviso No fui yo.
  const alertaId = uuidv7();
  await base.sistema.db.insert(alertas).values({
    id: alertaId,
    organizacionId,
    eventoId,
    tipo: 'no_fui_yo',
    asistenteId,
    clave: `prueba:${alertaId}`,
  });
  return {
    organizacionId,
    eventoId,
    retoId,
    pantallaId,
    recursos: {
      retos: retoId,
      pantallas: pantallaId,
      lugares: lugarId,
      actividades: actividadId,
      sponsors: sponsorId,
      preguntas: preguntaId,
      premios: premioId,
      mesas: mesaId,
      asistentes: asistenteId,
      operaciones: exportacionId,
      importaciones: importacionId,
      accesos: accesoId,
      alertas: alertaId,
      canjes: canjeId,
    },
  };
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
  opciones: { rolPlataforma?: 'superadmin' | 'admin' | 'soporte'; email?: string } = {},
): Promise<PersonaDePrueba> {
  const usuarioId = uuidv7();
  await base.sistema.db.insert(usuarios).values({
    id: usuarioId,
    email: opciones.email ?? `${usuarioId}@example.com`,
    nombre,
    passwordHash: 'sin-uso-en-pruebas',
    rolPlataforma: opciones.rolPlataforma ?? null,
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
  terminales: { pantallas?: string[]; mesas?: string[] } = {},
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
  for (const mesaId of terminales.mesas ?? []) {
    await base.sistema.db.insert(miembroTerminales).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      miembroEventoId: miembroId,
      mesaId,
    });
  }
  return miembroId;
}

/** Un miembro invitado que todavía no aceptó (para las rutas `/miembros/:id` en V9). */
export async function addInvitado(
  base: BaseDePrueba,
  evento: EventoDePrueba,
  rol: Exclude<RolEvento, 'dueno'> = 'registrador',
): Promise<string> {
  const id = uuidv7();
  await base.sistema.db.insert(miembrosEvento).values({
    id,
    organizacionId: evento.organizacionId,
    eventoId: evento.eventoId,
    emailInvitado: `invitado-${id}@example.com`,
    rol,
    estado: 'invitado',
  });
  return id;
}

/** Un recurso nuevo del evento, para las rutas `DELETE` de V9. */
export async function createRecursoDePrueba(
  base: BaseDePrueba,
  evento: EventoDePrueba,
  recurso: string,
): Promise<string> {
  const id = uuidv7();
  const { organizacionId, eventoId } = evento;
  switch (recurso) {
    case 'lugares':
      await base.sistema.db
        .insert(lugares)
        .values({ id, organizacionId, eventoId, tipo: 'stand', nombre: 'Stand V9' });
      return id;
    case 'sponsors':
      await base.sistema.db
        .insert(sponsors)
        .values({ id, organizacionId, eventoId, nombre: 'Sponsor V9' });
      return id;
    case 'actividades': {
      const inicio = new Date('2026-12-01T13:00:00Z');
      await base.sistema.db.insert(actividades).values({
        id,
        organizacionId,
        eventoId,
        titulo: 'Actividad V9',
        inicioAt: inicio,
        finAt: new Date(inicio.getTime() + 3_600_000),
      });
      return id;
    }
    case 'preguntas':
      await base.sistema.db
        .insert(preguntasFrecuentes)
        .values({ id, organizacionId, eventoId, pregunta: '¿V9?', respuesta: 'Sí.' });
      return id;
    case 'retos':
      await base.sistema.db
        .insert(retos)
        .values({ id, organizacionId, eventoId, nombre: 'Reto V9', puntos: 5, topeTotal: 10 });
      return id;
    case 'pantallas':
      await base.sistema.db
        .insert(pantallas)
        .values({ id, organizacionId, eventoId, nombre: 'Pantalla V9' });
      return id;
    case 'mesas':
      await base.sistema.db
        .insert(mesas)
        .values({ id, organizacionId, eventoId, nombre: 'Mesa V9' });
      return id;
    case 'premios':
      await base.sistema.db
        .insert(premios)
        .values({ id, organizacionId, eventoId, nombre: 'Premio V9', puntos: 5, stockTotal: 3 });
      return id;
    case 'miembros':
      return addInvitado(base, evento);
    default:
      throw new Error(`V9: no sé crear ${recurso}`);
  }
}
