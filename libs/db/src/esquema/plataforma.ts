import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { bytea, citext } from './tipos';

const creadoEn = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const actualizadoEn = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** Organizaciones (global, sin RLS). Modelo de datos §2. */
export const organizaciones = pgTable(
  'organizaciones',
  {
    id: uuid('id').primaryKey(),
    nombre: text('nombre').notNull(),
    slug: text('slug').notNull().unique(),
    estado: text('estado').notNull().default('activa'),
    esDemo: boolean('es_demo').notNull().default(false),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [check('organizaciones_estado', sql`${t.estado} in ('activa', 'suspendida')`)],
);

/** Personas del equipo y de Pasitos (global). Los asistentes del piloto no son usuarios (D33). */
export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id').primaryKey(),
    email: citext('email').notNull().unique(),
    nombre: text('nombre').notNull(),
    passwordHash: text('password_hash'),
    emailVerificadoAt: timestamp('email_verificado_at', { withTimezone: true }),
    rolPlataforma: text('rol_plataforma'),
    estado: text('estado').notNull().default('activo'),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [
    check(
      'usuarios_rol_plataforma',
      sql`${t.rolPlataforma} is null or ${t.rolPlataforma} in ('admin', 'soporte')`,
    ),
    check('usuarios_estado', sql`${t.estado} in ('activo', 'bloqueado')`),
  ],
);

/** Dueños de cada organización (con RLS). */
export const miembrosOrganizacion = pgTable(
  'miembros_organizacion',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    rol: text('rol').notNull(),
    createdAt: creadoEn(),
  },
  (t) => [
    unique('miembros_organizacion_unico').on(t.organizacionId, t.usuarioId),
    check('miembros_organizacion_rol', sql`${t.rol} in ('dueno')`),
    index('miembros_organizacion_usuario').on(t.usuarioId),
  ],
);

/** Sesiones del equipo y de los asistentes (global). Solo se guarda el hash del token. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    tokenHash: bytea('token_hash').notNull().unique(),
    tipo: text('tipo').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    vinculacionId: uuid('vinculacion_id'),
    segundoFactorAt: timestamp('segundo_factor_at', { withTimezone: true }),
    ultimoUsoAt: timestamp('ultimo_uso_at', { withTimezone: true }).notNull().defaultNow(),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    revocadaAt: timestamp('revocada_at', { withTimezone: true }),
    createdAt: creadoEn(),
  },
  (t) => [
    check('sessions_tipo', sql`${t.tipo} in ('usuario', 'asistente')`),
    check(
      'sessions_dueno',
      sql`(${t.tipo} = 'usuario' and ${t.usuarioId} is not null) or (${t.tipo} = 'asistente' and ${t.vinculacionId} is not null)`,
    ),
    index('sessions_usuario').on(t.usuarioId),
  ],
);

/** Tokens de un solo uso (global). Modelo de datos §2. */
export const tokens = pgTable(
  'tokens',
  {
    id: uuid('id').primaryKey(),
    tokenHash: bytea('token_hash').notNull().unique(),
    proposito: text('proposito').notNull(),
    eventoId: uuid('evento_id'),
    refId: uuid('ref_id'),
    creadoPor: uuid('creado_por'),
    motivo: text('motivo'),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    usadoAt: timestamp('usado_at', { withTimezone: true }),
    revocadoAt: timestamp('revocado_at', { withTimezone: true }),
    createdAt: creadoEn(),
  },
  (t) => [
    check(
      'tokens_proposito',
      sql`${t.proposito} in ('qr_asistente', 'enlace_corto_asistente', 'conexion_pantalla', 'conexion_mesa', 'invitacion_equipo', 'restablecer_password', 'verificar_email')`,
    ),
    index('tokens_ref').on(t.proposito, t.refId),
  ],
);
