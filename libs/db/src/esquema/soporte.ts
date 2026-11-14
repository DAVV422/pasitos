import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventos } from './eventos';
import { lotes } from './libro';

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

/**
 * Cada transacción que firma el operador, entre o no (HU-104 §1). Global, sin RLS: la lee y escribe
 * solo pasitos_sistema. Se agrega al enviar (`enviada`) y el resultado se fija una sola vez
 * (trigger en 0004_costo_red.sql); después no cambia ni se borra.
 */
export const transaccionesStellar = pgTable(
  'transacciones_stellar',
  {
    id: uuid('id').primaryKey(),
    // Nulo al instalar el WASM.
    eventoId: uuid('evento_id').references(() => eventos.id),
    loteId: uuid('lote_id').references(() => lotes.id),
    operacion: text('operacion').notNull(),
    txHash: text('tx_hash').notNull(),
    red: text('red').notNull(),
    resultado: text('resultado').notNull().default('enviada'),
    comisionEstimadaStroops: bigint('comision_estimada_stroops', { mode: 'bigint' }).notNull(),
    comisionStroops: bigint('comision_stroops', { mode: 'bigint' }),
    recursos: jsonb('recursos').notNull(),
    ledgerStellar: integer('ledger_stellar'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resueltaAt: timestamp('resuelta_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'transacciones_stellar_operacion',
      sql`${t.operacion} in ('upload_wasm', 'deploy', 'add_retos', 'raise_tope', 'add_pantallas', 'anchor', 'close', 'extend_ttl')`,
    ),
    check('transacciones_stellar_red', sql`${t.red} in ('local', 'testnet')`),
    check(
      'transacciones_stellar_resultado',
      sql`${t.resultado} in ('enviada', 'incluida', 'fallida', 'vencida')`,
    ),
    index('transacciones_stellar_evento').on(t.eventoId, t.createdAt),
    index('transacciones_stellar_fecha').on(t.createdAt),
    index('transacciones_stellar_hash').on(t.txHash),
  ],
);
