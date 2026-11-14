import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizaciones } from './plataforma';
import { bytea } from './tipos';

/**
 * Eventos (con RLS). Columnas base (T-003) y las del libro y el anclaje (HU-101);
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
    // HU-101: anclaje y libro.
    // Sal secreta para el ID anónimo de los lotes públicos. La genera la base y no sale de ella.
    salAnonima: bytea('sal_anonima')
      .notNull()
      .default(sql`sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea)`),
    contratoId: text('contrato_id'),
    intervaloAnclajeMin: integer('intervalo_anclaje_min'),
    topePuntosPersona: integer('tope_puntos_persona'),
    ultimoNumeroReto: integer('ultimo_numero_reto').notNull().default(0),
    ultimoNumeroPantalla: integer('ultimo_numero_pantalla').notNull().default(0),
    // SHA-256 (hex) de evidencia-stellar.json, guardado al cerrar el contrato (HU-105 §2).
    evidenciaSha256: text('evidencia_sha256'),
    // Hasta cuándo los datos del contrato quedan consultables en la red sin restaurarlos (D59).
    enRedHasta: timestamp('en_red_hasta', { withTimezone: true }),
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
    check(
      'eventos_intervalo_anclaje',
      sql`${t.intervaloAnclajeMin} is null or ${t.intervaloAnclajeMin} in (2, 5, 10, 15, 30)`,
    ),
    check(
      'eventos_tope_puntos_persona',
      sql`${t.topePuntosPersona} is null or ${t.topePuntosPersona} > 0`,
    ),
    index('eventos_organizacion').on(t.organizacionId),
  ],
);
