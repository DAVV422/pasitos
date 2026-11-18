import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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
    // Segundo factor por app de códigos (HU-201 §4), cifrado con LLAVE_CIFRADO_DATOS.
    totpSecretCifrado: bytea('totp_secret_cifrado'),
    // Último paso de 30 s aceptado: el mismo código no sirve dos veces.
    totpUltimoPaso: bigint('totp_ultimo_paso', { mode: 'number' }),
    // Intentos de contraseña seguidos y espera o bloqueo vigente (HU-201 §3, D26).
    intentosFallidos: integer('intentos_fallidos').notNull().default(0),
    bloqueadoHasta: timestamp('bloqueado_hasta', { withTimezone: true }),
    passwordCambiadaAt: timestamp('password_cambiada_at', { withTimezone: true }),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [
    // superadmin: el primer administrador (`pnpm plataforma crear-admin`), el único que nombra
    // a los demás (HU-202 §4). Hay como mucho uno.
    check(
      'usuarios_rol_plataforma',
      sql`${t.rolPlataforma} is null or ${t.rolPlataforma} in ('superadmin', 'admin', 'soporte')`,
    ),
    uniqueIndex('usuarios_un_superadmin')
      .on(t.rolPlataforma)
      .where(sql`${t.rolPlataforma} = 'superadmin'`),
    check('usuarios_estado', sql`${t.estado} in ('activo', 'bloqueado')`),
  ],
);

/**
 * Dueños de cada organización (con RLS). El dueño se invita desde la consola (HU-202): queda
 * `invitado` con su correo hasta que acepta; al cambiar de dueño, el anterior pasa a `revocado`
 * cuando el nuevo acepta.
 */
export const miembrosOrganizacion = pgTable(
  'miembros_organizacion',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    // Se completa al aceptar.
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    emailInvitado: citext('email_invitado'),
    rol: text('rol').notNull(),
    estado: text('estado').notNull().default('activo'),
    invitadoPor: uuid('invitado_por').references(() => usuarios.id),
    aceptadoAt: timestamp('aceptado_at', { withTimezone: true }),
    revocadoAt: timestamp('revocado_at', { withTimezone: true }),
    createdAt: creadoEn(),
  },
  (t) => [
    unique('miembros_organizacion_unico').on(t.organizacionId, t.usuarioId),
    check('miembros_organizacion_rol', sql`${t.rol} in ('dueno')`),
    check('miembros_organizacion_estado', sql`${t.estado} in ('invitado', 'activo', 'revocado')`),
    check(
      'miembros_organizacion_quien',
      sql`${t.usuarioId} is not null or ${t.emailInvitado} is not null`,
    ),
    uniqueIndex('miembros_organizacion_invitacion')
      .on(t.organizacionId, t.emailInvitado)
      .where(sql`${t.estado} = 'invitado'`),
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
    // Sesión del asistente (HU-306): de qué organización es, para abrir withOrganizacion sin la
    // conexión de sistema. Otro nombre que `organizacion_id`: esta tabla es global, sin RLS.
    asistenteOrganizacionId: uuid('asistente_organizacion_id'),
    segundoFactorAt: timestamp('segundo_factor_at', { withTimezone: true }),
    ultimoUsoAt: timestamp('ultimo_uso_at', { withTimezone: true }).notNull().defaultNow(),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    revocadaAt: timestamp('revocada_at', { withTimezone: true }),
    // "Chrome en Windows", para la lista de sesiones abiertas.
    dispositivo: text('dispositivo'),
    createdAt: creadoEn(),
  },
  (t) => [
    check('sessions_tipo', sql`${t.tipo} in ('usuario', 'asistente')`),
    check(
      'sessions_dueno',
      sql`(${t.tipo} = 'usuario' and ${t.usuarioId} is not null) or (${t.tipo} = 'asistente' and ${t.vinculacionId} is not null and ${t.asistenteOrganizacionId} is not null)`,
    ),
    index('sessions_usuario').on(t.usuarioId),
    index('sessions_vinculacion').on(t.vinculacionId),
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
    // Lo que el token guarda hasta usarse (el secreto de TOTP por confirmar, el desafío de
    // WebAuthn), cifrado con LLAVE_CIFRADO_DATOS.
    secretoCifrado: bytea('secreto_cifrado'),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    usadoAt: timestamp('usado_at', { withTimezone: true }),
    revocadoAt: timestamp('revocado_at', { withTimezone: true }),
    createdAt: creadoEn(),
  },
  (t) => [
    check(
      'tokens_proposito',
      sql`${t.proposito} in ('qr_asistente', 'enlace_corto_asistente', 'conexion_pantalla', 'conexion_mesa', 'invitacion_equipo', 'invitacion_organizacion', 'invitacion_plataforma', 'restablecer_password', 'desafio_webauthn', 'configurar_totp', 'verificar_email')`,
    ),
    index('tokens_ref').on(t.proposito, t.refId),
  ],
);

/** Passkeys del equipo (WebAuthn, HU-201 §4). Global, sin RLS. */
export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    credentialId: bytea('credential_id').notNull().unique(),
    publicKey: bytea('public_key').notNull(),
    contador: bigint('contador', { mode: 'number' }).notNull().default(0),
    transports: text('transports')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    nombre: text('nombre').notNull(),
    createdAt: creadoEn(),
    ultimoUsoAt: timestamp('ultimo_uso_at', { withTimezone: true }),
  },
  (t) => [index('passkeys_usuario').on(t.usuarioId)],
);

/**
 * Qué versión de los términos y de la privacidad aceptó cada persona y cuándo (Modelo §5). Global,
 * sin RLS: guarda solo ids. El asistente llega con la fase 3.
 */
export const aceptacionesTerminos = pgTable(
  'aceptaciones_terminos',
  {
    id: uuid('id').primaryKey(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    asistenteId: uuid('asistente_id'),
    documento: text('documento').notNull(),
    version: text('version').notNull(),
    createdAt: creadoEn(),
  },
  (t) => [
    check('aceptaciones_terminos_documento', sql`${t.documento} in ('terminos', 'privacidad')`),
    check('aceptaciones_terminos_quien', sql`num_nonnulls(${t.usuarioId}, ${t.asistenteId}) = 1`),
    index('aceptaciones_terminos_usuario').on(t.usuarioId),
  ],
);
