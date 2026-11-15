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
import { archivos } from './archivos';
import { eventos } from './eventos';
import { retos } from './libro';
import { organizaciones } from './plataforma';

/** Contenido del evento para asistentes y la página pública (HU-206 §2, Modelo §3). Con RLS. */
const base = () => ({
  id: uuid('id').primaryKey(),
  organizacionId: uuid('organizacion_id')
    .notNull()
    .references(() => organizaciones.id),
  eventoId: uuid('evento_id')
    .notNull()
    .references(() => eventos.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Salas, stands, mesas y servicios. `numero_mapa` une cada lugar con su número del plano. */
export const lugares = pgTable(
  'lugares',
  {
    ...base(),
    tipo: text('tipo').notNull(),
    nombre: text('nombre').notNull(),
    numeroMapa: integer('numero_mapa'),
    descripcion: text('descripcion'),
  },
  (t) => [
    check('lugares_tipo', sql`${t.tipo} in ('sala', 'stand', 'mesa', 'servicio')`),
    check('lugares_numero_mapa', sql`${t.numeroMapa} is null or ${t.numeroMapa} between 1 and 99`),
    uniqueIndex('lugares_numero_mapa_unico')
      .on(t.eventoId, t.numeroMapa)
      .where(sql`${t.numeroMapa} is not null`),
    index('lugares_evento').on(t.eventoId),
  ],
);

export const sponsors = pgTable(
  'sponsors',
  {
    ...base(),
    nombre: text('nombre').notNull(),
    logoArchivoId: uuid('logo_archivo_id').references(() => archivos.id),
    descripcion: text('descripcion'),
    enlace: text('enlace'),
    // Su stand.
    lugarId: uuid('lugar_id').references(() => lugares.id),
    orden: integer('orden').notNull().default(0),
  },
  (t) => [
    check('sponsors_enlace', sql`${t.enlace} is null or ${t.enlace} like 'https://%'`),
    index('sponsors_evento').on(t.eventoId, t.orden),
  ],
);

/** La agenda. */
export const actividades = pgTable(
  'actividades',
  {
    ...base(),
    titulo: text('titulo').notNull(),
    inicioAt: timestamp('inicio_at', { withTimezone: true }).notNull(),
    finAt: timestamp('fin_at', { withTimezone: true }).notNull(),
    lugarId: uuid('lugar_id').references(() => lugares.id),
    expositor: text('expositor'),
    sponsorId: uuid('sponsor_id').references(() => sponsors.id),
    retoId: uuid('reto_id').references(() => retos.id),
    descripcion: text('descripcion'),
  },
  (t) => [
    check('actividades_fechas', sql`${t.finAt} > ${t.inicioAt}`),
    index('actividades_evento').on(t.eventoId, t.inicioAt),
  ],
);

export const preguntasFrecuentes = pgTable(
  'preguntas_frecuentes',
  {
    ...base(),
    pregunta: text('pregunta').notNull(),
    respuesta: text('respuesta').notNull(),
    orden: integer('orden').notNull().default(0),
  },
  (t) => [index('preguntas_frecuentes_evento').on(t.eventoId, t.orden)],
);
