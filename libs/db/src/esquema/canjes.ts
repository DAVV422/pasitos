import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { premios } from './contenido';
import { mesas } from './equipo';
import { eventos } from './eventos';
import { asistentes, movimientos } from './libro';
import { organizaciones, usuarios } from './plataforma';
import { bytea } from './tipos';

/**
 * Un cobro de la mesa de canje (HU-316, Modelo §6). Nace `pendiente` con el stock **reservado** y
 * un token de 2 minutos; el celular lo confirma (HU-313), o vence o se cancela y el stock vuelve.
 * `movimientos.canje_id` apunta aquí (la clave foránea está en la migración `0031_canjes`).
 */
export const canjes = pgTable(
  'canjes',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    mesaId: uuid('mesa_id')
      .notNull()
      .references(() => mesas.id),
    asistenteId: uuid('asistente_id').references(() => asistentes.id),
    tokenHash: bytea('token_hash').notNull().unique(),
    /** *C-4821*: lo que miran la mesa y el celular para entregar. */
    comprobante: text('comprobante').notNull(),
    totalPuntos: integer('total_puntos').notNull(),
    estado: text('estado').notNull().default('pendiente'),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    confirmadoAt: timestamp('confirmado_at', { withTimezone: true }),
    canceladoAt: timestamp('cancelado_at', { withTimezone: true }),
    // HU-401: el cobro pendiente que se canceló al cerrar el evento.
    canceladoPorCierre: boolean('cancelado_por_cierre').notNull().default(false),
    canceladoPor: uuid('cancelado_por').references(() => usuarios.id),
    anuladoAt: timestamp('anulado_at', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => usuarios.id),
    motivoAnulacion: text('motivo_anulacion'),
    movimientoId: uuid('movimiento_id').references(() => movimientos.id),
    movimientoAnulacionId: uuid('movimiento_anulacion_id').references(() => movimientos.id),
    // HU-321 y HU-325.
    requiereCi: boolean('requiere_ci').notNull().default(false),
    grupoId: uuid('grupo_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'canjes_estado',
      sql`${t.estado} in ('pendiente', 'confirmado', 'vencido', 'cancelado', 'anulado')`,
    ),
    check('canjes_total', sql`${t.totalPuntos} >= 0`),
    check('canjes_comprobante', sql`${t.comprobante} ~ '^C-[0-9]{4}$'`),
    unique('canjes_comprobante_evento').on(t.eventoId, t.comprobante),
    index('canjes_mesa').on(t.mesaId, t.createdAt),
    index('canjes_pendientes')
      .on(t.expiraAt)
      .where(sql`${t.estado} = 'pendiente'`),
    index('canjes_asistente').on(t.asistenteId),
  ],
);

/** Los productos de un cobro, con el precio que tenían al cobrar. */
export const canjeItems = pgTable(
  'canje_items',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    canjeId: uuid('canje_id')
      .notNull()
      .references(() => canjes.id),
    premioId: uuid('premio_id')
      .notNull()
      .references(() => premios.id),
    cantidad: integer('cantidad').notNull(),
    puntosUnitarios: integer('puntos_unitarios').notNull(),
  },
  (t) => [
    check('canje_items_cantidad', sql`${t.cantidad} between 1 and 20`),
    check('canje_items_puntos', sql`${t.puntosUnitarios} >= 0`),
    unique('canje_items_premio').on(t.canjeId, t.premioId),
    index('canje_items_premio_idx').on(t.premioId),
  ],
);

/**
 * El texto libre de un ajuste (*Otro: …*, HU-317). El libro guarda solo la categoría, que es lo que
 * se publica en el lote; el texto queda aquí, para el equipo.
 */
export const notasMovimiento = pgTable('notas_movimiento', {
  movimientoId: uuid('movimiento_id')
    .primaryKey()
    .references(() => movimientos.id),
  organizacionId: uuid('organizacion_id')
    .notNull()
    .references(() => organizaciones.id),
  eventoId: uuid('evento_id')
    .notNull()
    .references(() => eventos.id),
  texto: text('texto').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
