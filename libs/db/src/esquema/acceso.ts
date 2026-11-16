import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { eventos } from './eventos';
import { asistentes } from './libro';
import { organizaciones, usuarios } from './plataforma';
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
