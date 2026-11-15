import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventos } from './eventos';
import { pantallas } from './libro';
import { organizaciones, usuarios } from './plataforma';
import { citext } from './tipos';

/**
 * El equipo de cada evento (D19, HU-204 y HU-203), con RLS por organización. El dueño de la
 * organización no está aquí: es dueño de todos sus eventos (`miembros_organizacion`).
 */
export const miembrosEvento = pgTable(
  'miembros_evento',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    // Se completa al aceptar la invitación.
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    emailInvitado: citext('email_invitado').notNull(),
    rol: text('rol').notNull(),
    estado: text('estado').notNull().default('invitado'),
    invitadoPor: uuid('invitado_por').references(() => usuarios.id),
    aceptadoAt: timestamp('aceptado_at', { withTimezone: true }),
    revocadoAt: timestamp('revocado_at', { withTimezone: true }),
    // Solo registradores. null = el del evento.
    topeRegistrosPuerta: integer('tope_registros_puerta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'miembros_evento_rol',
      sql`${t.rol} in ('coorganizador', 'registrador', 'operador_mesa', 'operador_stand', 'financiador')`,
    ),
    check(
      'miembros_evento_estado',
      sql`${t.estado} in ('invitado', 'activo', 'vencido', 'revocado')`,
    ),
    check(
      'miembros_evento_tope',
      sql`${t.topeRegistrosPuerta} is null or ${t.topeRegistrosPuerta} between 1 and 100000`,
    ),
    // Una invitación vigente por correo y evento.
    uniqueIndex('miembros_evento_email')
      .on(t.eventoId, t.emailInvitado)
      .where(sql`${t.estado} <> 'revocado'`),
    index('miembros_evento_usuario').on(t.usuarioId, t.eventoId),
  ],
);

/** Qué mesas o pantallas tiene asignadas un operador (²). La FK a `mesas` llega con HU-209. */
export const miembroTerminales = pgTable(
  'miembro_terminales',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    miembroEventoId: uuid('miembro_evento_id')
      .notNull()
      .references(() => miembrosEvento.id),
    pantallaId: uuid('pantalla_id').references(() => pantallas.id),
    mesaId: uuid('mesa_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('miembro_terminales_una', sql`num_nonnulls(${t.pantallaId}, ${t.mesaId}) = 1`),
    uniqueIndex('miembro_terminales_pantalla')
      .on(t.miembroEventoId, t.pantallaId)
      .where(sql`${t.pantallaId} is not null`),
    uniqueIndex('miembro_terminales_mesa')
      .on(t.miembroEventoId, t.mesaId)
      .where(sql`${t.mesaId} is not null`),
  ],
);
