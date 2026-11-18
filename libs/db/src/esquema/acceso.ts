import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventos } from './eventos';
import { asistentes } from './libro';
import { organizaciones, tokens, usuarios } from './plataforma';
import { enviosCorreo } from './soporte';
import { bytea } from './tipos';

/**
 * Invitaciones por correo (HU-211, Modelo §5). Con RLS; al abrir el enlace (fase 3) se busca por
 * `token_hash` con el rol de sistema. El token se guarda solo como hash y cifrado (ajuste 6): así
 * *Descargar enlaces* devuelve el mismo que se mandó por correo.
 */
export const invitaciones = pgTable(
  'invitaciones',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    asistenteId: uuid('asistente_id')
      .notNull()
      .references(() => asistentes.id),
    tokenHash: bytea('token_hash').notNull().unique(),
    tokenCifrado: bytea('token_cifrado').notNull(),
    estado: text('estado').notNull().default('creada'),
    envioCorreoId: uuid('envio_correo_id').references(() => enviosCorreo.id),
    enviadaAt: timestamp('enviada_at', { withTimezone: true }),
    usadaAt: timestamp('usada_at', { withTimezone: true }),
    revocadaAt: timestamp('revocada_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => usuarios.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'invitaciones_estado',
      sql`${t.estado} in ('creada', 'enviada', 'rebotada', 'usada', 'revocada')`,
    ),
    // Una sola invitación no revocada por asistente.
    uniqueIndex('invitaciones_vigente')
      .on(t.asistenteId)
      .where(sql`${t.estado} <> 'revocada'`),
    index('invitaciones_evento').on(t.eventoId),
    index('invitaciones_envio').on(t.envioCorreoId),
  ],
);

/**
 * Un navegador vinculado en un evento (HU-306, Modelo §5). `device_id_hash` es el SHA-256 del id
 * aleatorio que el navegador guarda en tres lugares: único por evento, **una identidad por
 * navegador** (V19). La llave pública verifica las firmas; se borra a los 30 días (HU-307).
 */
export const dispositivos = pgTable(
  'dispositivos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    deviceIdHash: bytea('device_id_hash').notNull(),
    // P-256 sin comprimir (65 bytes). Nula después del borrado.
    llavePublica: bytea('llave_publica'),
    // HU-307.
    huella: bytea('huella'),
    // "Chrome en Android": lo que ve el equipo. Se conserva.
    modelo: text('modelo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    borrarAt: timestamp('borrar_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('dispositivos_navegador').on(t.eventoId, t.deviceIdHash)],
);

/**
 * Qué dispositivo tiene la entrada de cada asistente, con su historial (HU-306, Modelo §5).
 * **Un dispositivo por invitado** (V17): una sola vinculación activa por asistente, y un
 * dispositivo activo en una sola entrada.
 */
export const vinculaciones = pgTable(
  'vinculaciones',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    asistenteId: uuid('asistente_id')
      .notNull()
      .references(() => asistentes.id),
    dispositivoId: uuid('dispositivo_id')
      .notNull()
      .references(() => dispositivos.id),
    metodo: text('metodo').notNull(),
    invitacionId: uuid('invitacion_id').references(() => invitaciones.id),
    tokenId: uuid('token_id').references(() => tokens.id),
    registradorId: uuid('registrador_id').references(() => usuarios.id),
    anuladaAt: timestamp('anulada_at', { withTimezone: true }),
    anuladaPor: uuid('anulada_por').references(() => usuarios.id),
    motivoAnulacion: text('motivo_anulacion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'vinculaciones_metodo',
      sql`${t.metodo} in ('enlace', 'qr_puerta', 'enlace_corto', 'autoregistro')`,
    ),
    uniqueIndex('vinculaciones_activa')
      .on(t.asistenteId)
      .where(sql`${t.anuladaAt} is null`),
    uniqueIndex('vinculaciones_dispositivo_activo')
      .on(t.dispositivoId)
      .where(sql`${t.anuladaAt} is null`),
    index('vinculaciones_dispositivo').on(t.dispositivoId),
  ],
);

/**
 * La respuesta de cada operación con `Idempotency-Key` (API §2.1, ajuste 2 de la fase 3). La
 * misma clave con el mismo cuerpo devuelve la misma respuesta; con otro cuerpo, un error. Global,
 * sin RLS: solo ids y la respuesta. Se borra a las 24 h.
 */
export const idempotencia = pgTable(
  'idempotencia',
  {
    actor: text('actor').notNull(),
    clave: uuid('clave').notNull(),
    ruta: text('ruta').notNull(),
    hashCuerpo: bytea('hash_cuerpo').notNull(),
    estadoHttp: integer('estado_http'),
    respuesta: jsonb('respuesta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.actor, t.clave] }), index('idempotencia_vieja').on(t.createdAt)],
);
