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
import { bytea, citext } from './tipos';
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

/**
 * Cola y estado de cada correo (T-007 §3, D57). Global, sin RLS: la escriben el API (encolar) y
 * el trabajador (enviar). Nada se envía directo desde un request. `datos` lleva lo que pide el
 * texto del catálogo (`libs/dominio/src/correos/catalogo.ts`); el destinatario y los datos son
 * personales: nunca van a los logs.
 */
export const enviosCorreo = pgTable(
  'envios_correo',
  {
    id: uuid('id').primaryKey(),
    tipo: text('tipo').notNull(),
    prioridad: integer('prioridad').notNull(),
    destinatario: citext('destinatario').notNull(),
    datos: jsonb('datos').notNull(),
    estado: text('estado').notNull().default('en_cola'),
    // Cuándo se estima que sale, para mostrar "sale el 18/11". Se recalcula en cada vuelta.
    programadoPara: timestamp('programado_para', { withTimezone: true }).notNull(),
    refId: uuid('ref_id'),
    proveedorId: text('proveedor_id'),
    intentos: integer('intentos').notNull().default(0),
    error: text('error'),
    enviadoAt: timestamp('enviado_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('envios_correo_prioridad', sql`${t.prioridad} between 1 and 4`),
    check(
      'envios_correo_estado',
      sql`${t.estado} in ('en_cola', 'enviado', 'entregado', 'rebotado', 'fallido', 'cancelado')`,
    ),
    index('envios_correo_cola')
      .on(t.prioridad, t.createdAt)
      .where(sql`${t.estado} = 'en_cola'`),
    index('envios_correo_enviados').on(t.enviadoAt),
    index('envios_correo_ref').on(t.refId),
  ],
);

/**
 * Operaciones en segundo plano (HU-210, Modelo §9): importar y exportar la lista de invitados,
 * enviar invitaciones. Global (sin RLS): `GET /operaciones/:id` la busca por id.
 */
export const operaciones = pgTable(
  'operaciones',
  {
    id: uuid('id').primaryKey(),
    tipo: text('tipo').notNull(),
    organizacionId: uuid('organizacion_id').notNull(),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    estado: text('estado').notNull().default('en_cola'),
    progreso: integer('progreso').notNull().default(0),
    /** Lo que pidió quien la creó (el archivo, los filtros). */
    parametros: jsonb('parametros').notNull().default({}),
    /** Lo que ve el panel (la vista previa, los totales). */
    resultado: jsonb('resultado'),
    /** Lo que necesita el paso siguiente y nadie más ve (las filas válidas). Se borra al confirmar. */
    datos: jsonb('datos'),
    error: text('error'),
    createdBy: uuid('created_by'),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    // Exportar: el enlace de descarga de un solo uso.
    descargaTokenHash: bytea('descarga_token_hash'),
    descargaExpiraAt: timestamp('descarga_expira_at', { withTimezone: true }),
    descargadaAt: timestamp('descargada_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'operaciones_tipo',
      sql`${t.tipo} in ('import-asistentes', 'export-asistentes', 'send-invitaciones')`,
    ),
    check(
      'operaciones_estado',
      sql`${t.estado} in ('en_cola', 'procesando', 'lista', 'fallida', 'confirmada')`,
    ),
    check('operaciones_progreso', sql`${t.progreso} between 0 and 100`),
    index('operaciones_pendientes').on(t.estado, t.createdAt),
    index('operaciones_evento').on(t.eventoId),
  ],
);
