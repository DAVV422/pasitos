import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizaciones } from './plataforma';

/**
 * Eventos (con RLS). En la fase 0 solo las columnas base (T-003);
 * las demás las agregan sus HU (Modelo de datos §3).
 */
export const eventos = pgTable(
  'eventos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    slug: text('slug').notNull().unique(),
    nombre: text('nombre').notNull(),
    tipo: text('tipo').notNull().default('real'),
    estado: text('estado').notNull().default('borrador'),
    visibilidad: text('visibilidad').notNull().default('privado'),
    zonaHoraria: text('zona_horaria').notNull().default('America/La_Paz'),
    inicioAt: timestamp('inicio_at', { withTimezone: true }).notNull(),
    finAt: timestamp('fin_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('eventos_tipo', sql`${t.tipo} in ('real', 'demo', 'prueba')`),
    check(
      'eventos_estado',
      sql`${t.estado} in ('borrador', 'publicado', 'en_curso', 'pausado', 'cerrado', 'archivado')`,
    ),
    check('eventos_visibilidad', sql`${t.visibilidad} in ('privado', 'solo_enlace', 'publico')`),
    check('eventos_fechas', sql`${t.finAt} > ${t.inicioAt}`),
    index('eventos_organizacion').on(t.organizacionId),
  ],
);
