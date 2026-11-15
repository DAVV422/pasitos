import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { eventos } from './eventos';
import { organizaciones, usuarios } from './plataforma';

/**
 * Archivos subidos y su validación (Subida de archivos §4, HU-214), con RLS. Las rutas de disco
 * salen de esta fila, nunca del request. `variantes`: `{ original, 1200, 400 }` relativas a
 * ARCHIVOS_DIR.
 */
export const archivos = pgTable(
  'archivos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    proposito: text('proposito').notNull(),
    // Limpio, solo para mostrar.
    nombreOriginal: text('nombre_original').notNull(),
    mime: text('mime'),
    tamanoBytes: integer('tamano_bytes').notNull(),
    ancho: integer('ancho'),
    alto: integer('alto'),
    sha256: text('sha256'),
    estado: text('estado').notNull().default('cuarentena'),
    motivoRechazo: text('motivo_rechazo'),
    variantes: jsonb('variantes'),
    subidoPor: uuid('subido_por').references(() => usuarios.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reemplazadoAt: timestamp('reemplazado_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'archivos_proposito',
      sql`${t.proposito} in ('logo_evento', 'portada', 'plano', 'logo_sponsor', 'imagen_premio', 'importacion_csv', 'mapa_estatico')`,
    ),
    check('archivos_estado', sql`${t.estado} in ('cuarentena', 'aprobado', 'rechazado')`),
    index('archivos_evento').on(t.eventoId, t.proposito),
    index('archivos_cuarentena')
      .on(t.createdAt)
      .where(sql`${t.estado} = 'cuarentena'`),
  ],
);
