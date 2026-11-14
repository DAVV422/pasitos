import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Outbox (global): avisos en vivo y trabajos que no se pueden perder (Backend §3). */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    tipo: text('tipo').notNull(),
    eventoId: uuid('evento_id'),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    procesadoAt: timestamp('procesado_at', { withTimezone: true }),
  },
  (t) => [
    index('outbox_pendientes')
      .on(t.createdAt)
      .where(sql`${t.procesadoAt} is null`),
  ],
);
