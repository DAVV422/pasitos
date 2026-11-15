import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { eventos } from './eventos';
import { organizaciones, usuarios } from './plataforma';
import { bytea, citext } from './tipos';

/**
 * Libro de movimientos y lo mínimo que necesita para existir (HU-101).
 * `asistentes`, `retos` y `pantallas` tienen solo las columnas que usa el libro;
 * sus HU de la fase 2 agregan el resto (Modelo de datos §3 a §7).
 * Todas con RLS por organización (0002_libro.sql).
 */

const creadoEn = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const actualizadoEn = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const organizacion = () =>
  uuid('organizacion_id')
    .notNull()
    .references(() => organizaciones.id);
const evento = () =>
  uuid('evento_id')
    .notNull()
    .references(() => eventos.id);

/** Una fila por persona en cada evento. `id_anonimo` lo calcula la base (trigger) con la sal del evento. */
export const asistentes = pgTable(
  'asistentes',
  {
    id: uuid('id').primaryKey(),
    organizacionId: organizacion(),
    eventoId: evento(),
    // Lo asigna siempre el trigger `asignar_codigo_asistente` (0021_invitados.sql): A-0001, A-0002…
    codigoAsistente: text('codigo_asistente').notNull().default(''),
    nombre: text('nombre').notNull(),
    estado: text('estado').notNull().default('invitado'),
    // HU-210: la lista de invitados.
    codigoExterno: text('codigo_externo'),
    email: citext('email'),
    emailEstado: text('email_estado').notNull().default('sin_correo'),
    origen: text('origen').notNull().default('lista'),
    registradoPor: uuid('registrado_por').references(() => usuarios.id),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    createdBy: uuid('created_by').references(() => usuarios.id),
    // Lo reemplaza siempre el trigger `asignar_id_anonimo` (0002_libro.sql).
    idAnonimo: bytea('id_anonimo')
      .notNull()
      .default(sql`decode('', 'hex')`),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [
    unique('asistentes_codigo').on(t.eventoId, t.codigoAsistente),
    unique('asistentes_id_anonimo').on(t.eventoId, t.idAnonimo),
    check(
      'asistentes_estado',
      sql`${t.estado} in ('invitado', 'registrado', 'presente', 'cancelado')`,
    ),
    check(
      'asistentes_email_estado',
      sql`${t.emailEstado} in ('sin_correo', 'pendiente', 'en_cola', 'enviado', 'rebotado')`,
    ),
    check('asistentes_origen', sql`${t.origen} in ('lista', 'csv', 'puerta')`),
    check('asistentes_nombre', sql`char_length(${t.nombre}) between 2 and 120`),
    uniqueIndex('asistentes_email')
      .on(t.eventoId, t.email)
      .where(sql`${t.email} is not null`),
    uniqueIndex('asistentes_codigo_externo')
      .on(t.eventoId, t.codigoExterno)
      .where(sql`${t.codigoExterno} is not null`),
  ],
);

/** Retos. `numero` es el número corto del contrato: lo asigna la base y no cambia nunca. */
export const retos = pgTable(
  'retos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: organizacion(),
    eventoId: evento(),
    // Lo asigna siempre el trigger de la base con el contador del evento (0002_libro.sql).
    numero: integer('numero').notNull().default(0),
    nombre: text('nombre').notNull(),
    tipo: text('tipo').notNull().default('qr'),
    puntos: integer('puntos').notNull(),
    topeTotal: integer('tope_total').notNull(),
    vecesPorPersona: integer('veces_por_persona').notNull().default(1),
    entregados: integer('entregados').notNull().default(0),
    estado: text('estado').notNull().default('activo'),
    registradoEnStellarAt: timestamp('registrado_en_stellar_at', { withTimezone: true }),
    // HU-207: cómo se completa y dónde. Los modos de P2 quedan en el CHECK para después.
    descripcion: text('descripcion'),
    modoQr: text('modo_qr').notNull().default('por_tiempo'),
    rotacionSegundos: integer('rotacion_segundos').notNull().default(30),
    // Las pantallas de este lugar lo muestran (HU-209). Sin FK aquí: `lugares` está en contenido.ts.
    lugarId: uuid('lugar_id'),
    disponibleDesde: timestamp('disponible_desde', { withTimezone: true }),
    disponibleHasta: timestamp('disponible_hasta', { withTimezone: true }),
    sponsorId: uuid('sponsor_id'),
    createdBy: uuid('created_by'),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [
    unique('retos_numero').on(t.eventoId, t.numero),
    check('retos_tipo', sql`${t.tipo} in ('qr', 'otorgado', 'encuesta')`),
    check('retos_estado', sql`${t.estado} in ('activo', 'desactivado')`),
    check('retos_puntos', sql`${t.puntos} > 0`),
    check('retos_tope_total', sql`${t.topeTotal} > 0`),
    check('retos_veces_por_persona', sql`${t.vecesPorPersona} >= 1`),
    check('retos_entregados', sql`${t.entregados} >= 0 and ${t.entregados} <= ${t.topeTotal}`),
    check('retos_numero_positivo', sql`${t.numero} >= 1`),
    check(
      'retos_modo_qr',
      sql`${t.modoQr} in ('por_tiempo', 'un_uso', 'bajo_demanda', 'usos_limitados')`,
    ),
    check('retos_rotacion', sql`${t.rotacionSegundos} in (15, 30, 60)`),
    check(
      'retos_horario',
      sql`${t.disponibleDesde} is null or ${t.disponibleHasta} is null or ${t.disponibleDesde} < ${t.disponibleHasta}`,
    ),
  ],
);

/** Pantallas de sala o stand. `numero` es el número corto del contrato. */
export const pantallas = pgTable(
  'pantallas',
  {
    id: uuid('id').primaryKey(),
    organizacionId: organizacion(),
    eventoId: evento(),
    // Lo asigna siempre el trigger de la base con el contador del evento (0002_libro.sql).
    numero: integer('numero').notNull().default(0),
    nombre: text('nombre').notNull(),
    llavePublica: bytea('llave_publica'),
    registradaEnStellarAt: timestamp('registrada_en_stellar_at', { withTimezone: true }),
    // HU-209: lugar, PIN de los controles, conexión y reemplazo de la tablet.
    // FK a lugares en la migración (0019), como retos.lugar_id: evita el ciclo con contenido.ts.
    lugarId: uuid('lugar_id'),
    pinHash: text('pin_hash'),
    epoca: integer('epoca').notNull().default(0),
    estado: text('estado').notNull().default('desconectada'),
    retoActualId: uuid('reto_actual_id').references((): AnyPgColumn => retos.id),
    sessionTokenHash: bytea('session_token_hash').unique(),
    conectadaPor: uuid('conectada_por').references(() => usuarios.id),
    conectadaAt: timestamp('conectada_at', { withTimezone: true }),
    ultimoContactoAt: timestamp('ultimo_contacto_at', { withTimezone: true }),
    reemplazadaPor: uuid('reemplazada_por').references((): AnyPgColumn => pantallas.id),
    motivoReemplazo: text('motivo_reemplazo'),
    createdBy: uuid('created_by').references(() => usuarios.id),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [
    check('pantallas_estado', sql`${t.estado} in ('activa', 'pausada', 'desconectada')`),
    check(
      'pantallas_motivo_reemplazo',
      sql`${t.motivoReemplazo} is null or char_length(${t.motivoReemplazo}) between 5 and 300`,
    ),
    index('pantallas_lugar').on(t.lugarId),
    unique('pantallas_numero').on(t.eventoId, t.numero),
    check('pantallas_numero_positivo', sql`${t.numero} >= 1`),
    check(
      'pantallas_llave_publica',
      sql`${t.llavePublica} is null or octet_length(${t.llavePublica}) = 65`,
    ),
  ],
);

/** El libro (D22). Solo se agregan filas: trigger y permisos (0002_libro.sql). */
export const movimientos = pgTable(
  'movimientos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: organizacion(),
    eventoId: evento(),
    asistenteId: uuid('asistente_id')
      .notNull()
      .references(() => asistentes.id),
    tipo: text('tipo').notNull(),
    puntos: integer('puntos').notNull(),
    retoId: uuid('reto_id').references(() => retos.id),
    // La clave foránea a `canjes` la agrega la fase 3, cuando exista la tabla.
    canjeId: uuid('canje_id'),
    pantallaId: uuid('pantalla_id').references(() => pantallas.id),
    anulaMovimientoId: uuid('anula_movimiento_id').references((): AnyPgColumn => movimientos.id),
    qr: jsonb('qr'),
    firmaDispositivo: bytea('firma_dispositivo'),
    autorId: uuid('autor_id').references(() => usuarios.id),
    motivo: text('motivo'),
    origen: text('origen').notNull(),
    createdAt: creadoEn(),
  },
  (t) => [
    check(
      'movimientos_tipo',
      sql`${t.tipo} in ('checkin', 'reto', 'canje', 'anulacion', 'ajuste', 'vencimiento')`,
    ),
    check('movimientos_origen', sql`${t.origen} in ('asistente', 'equipo', 'sistema')`),
    check(
      'movimientos_signo',
      sql`(${t.tipo} = 'checkin' and ${t.puntos} >= 0)
        or (${t.tipo} = 'reto' and ${t.puntos} > 0)
        or (${t.tipo} in ('canje', 'vencimiento') and ${t.puntos} < 0)
        or (${t.tipo} in ('anulacion', 'ajuste') and ${t.puntos} <> 0)`,
    ),
    check('movimientos_reto', sql`${t.tipo} <> 'reto' or ${t.retoId} is not null`),
    check('movimientos_canje', sql`${t.tipo} <> 'canje' or ${t.canjeId} is not null`),
    check(
      'movimientos_anulacion',
      sql`${t.tipo} <> 'anulacion' or ${t.anulaMovimientoId} is not null`,
    ),
    check(
      'movimientos_autor',
      sql`${t.tipo} not in ('ajuste', 'anulacion') or (${t.autorId} is not null and ${t.motivo} is not null)`,
    ),
    index('movimientos_evento').on(t.eventoId, t.id),
    index('movimientos_asistente').on(t.asistenteId, t.id),
  ],
);

/** Saldo actual: se actualiza en la misma transacción que el movimiento y se bloquea con FOR UPDATE. */
export const saldos = pgTable(
  'saldos',
  {
    asistenteId: uuid('asistente_id')
      .primaryKey()
      .references(() => asistentes.id),
    organizacionId: organizacion(),
    eventoId: evento(),
    puntos: integer('puntos').notNull().default(0),
    updatedAt: actualizadoEn(),
  },
  (t) => [check('saldos_no_negativo', sql`${t.puntos} >= 0`)],
);

/** Una fila cada vez que un asistente completa un reto. El UNIQUE impide pasar las veces por persona. */
export const participaciones = pgTable(
  'participaciones',
  {
    id: uuid('id').primaryKey(),
    organizacionId: organizacion(),
    eventoId: evento(),
    retoId: uuid('reto_id')
      .notNull()
      .references(() => retos.id),
    asistenteId: uuid('asistente_id')
      .notNull()
      .references(() => asistentes.id),
    numero: integer('numero').notNull(),
    movimientoId: uuid('movimiento_id')
      .notNull()
      .unique()
      .references(() => movimientos.id),
    createdAt: creadoEn(),
  },
  (t) => [
    unique('participaciones_unica').on(t.retoId, t.asistenteId, t.numero),
    check('participaciones_numero', sql`${t.numero} >= 1`),
  ],
);

/** Lotes anclados en Stellar (Contrato y sellador §3). */
export const lotes = pgTable(
  'lotes',
  {
    id: uuid('id').primaryKey(),
    organizacionId: organizacion(),
    eventoId: evento(),
    numero: integer('numero').notNull(),
    huellaAnterior: bytea('huella_anterior').notNull(),
    raiz: bytea('raiz').notNull(),
    huella: bytea('huella').notNull(),
    cantidadMovimientos: integer('cantidad_movimientos').notNull(),
    conteosPorReto: jsonb('conteos_por_reto').notNull(),
    esCierre: boolean('es_cierre').notNull().default(false),
    estado: text('estado').notNull().default('armado'),
    txHash: text('tx_hash'),
    ledgerStellar: integer('ledger_stellar'),
    intentos: integer('intentos').notNull().default(0),
    ultimoError: text('ultimo_error'),
    comisionEstimadaStroops: bigint('comision_estimada_stroops', { mode: 'bigint' }),
    comisionStroops: bigint('comision_stroops', { mode: 'bigint' }),
    archivoRuta: text('archivo_ruta'),
    armadoAt: timestamp('armado_at', { withTimezone: true }).notNull().defaultNow(),
    enviadoAt: timestamp('enviado_at', { withTimezone: true }),
    confirmadoAt: timestamp('confirmado_at', { withTimezone: true }),
  },
  (t) => [
    unique('lotes_numero').on(t.eventoId, t.numero),
    check('lotes_estado', sql`${t.estado} in ('armado', 'enviado', 'confirmado', 'rechazado')`),
    check('lotes_numero_positivo', sql`${t.numero} >= 1`),
    check(
      'lotes_hashes',
      sql`octet_length(${t.huellaAnterior}) = 32 and octet_length(${t.raiz}) = 32 and octet_length(${t.huella}) = 32`,
    ),
  ],
);

/** Asignación de cada movimiento a su lote. Solo se agregan filas: el libro no admite UPDATE. */
export const movimientosLote = pgTable(
  'movimientos_lote',
  {
    movimientoId: uuid('movimiento_id')
      .primaryKey()
      .references(() => movimientos.id),
    organizacionId: organizacion(),
    eventoId: evento(),
    loteId: uuid('lote_id')
      .notNull()
      .references(() => lotes.id),
    n: integer('n').notNull(),
  },
  (t) => [
    unique('movimientos_lote_n').on(t.eventoId, t.n),
    index('movimientos_lote_lote').on(t.loteId),
    check('movimientos_lote_n_positivo', sql`${t.n} >= 1`),
  ],
);

/** Bitácora (D35): solo se agregan filas, sin plazo de borrado. Modelo de datos §8. */
export const bitacora = pgTable(
  'bitacora',
  {
    id: uuid('id').primaryKey(),
    // Nulo en las acciones de la consola de plataforma (solo las escribe pasitos_sistema).
    organizacionId: uuid('organizacion_id').references(() => organizaciones.id),
    eventoId: uuid('evento_id').references(() => eventos.id),
    actorTipo: text('actor_tipo').notNull(),
    actorId: uuid('actor_id'),
    actorNombre: text('actor_nombre').notNull(),
    actorRol: text('actor_rol'),
    accion: text('accion').notNull(),
    objetoTipo: text('objeto_tipo'),
    objetoId: uuid('objeto_id'),
    objetoNombre: text('objeto_nombre'),
    antes: jsonb('antes'),
    despues: jsonb('despues'),
    dispositivoModelo: text('dispositivo_modelo'),
    createdAt: creadoEn(),
  },
  (t) => [
    check('bitacora_actor_tipo', sql`${t.actorTipo} in ('usuario', 'pantalla', 'mesa', 'sistema')`),
    index('bitacora_evento').on(t.eventoId, t.createdAt),
  ],
);
