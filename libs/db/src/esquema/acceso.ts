import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivos } from './archivos';
import { eventos } from './eventos';
import { asistentes, grupos, movimientos, pantallas, retos } from './libro';
import { organizaciones, tokens, usuarios } from './plataforma';
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

/**
 * Un navegador vinculado en un evento (HU-306, Modelo §5). `device_id_hash` es el SHA-256 del id
 * aleatorio que el navegador guarda en tres lugares: único por evento, **una identidad por
 * navegador** (V19). La llave pública verifica las firmas; se borra a los 30 días (HU-307).
 */
export const dispositivos = pgTable(
  'dispositivos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    deviceIdHash: bytea('device_id_hash').notNull(),
    // P-256 sin comprimir (65 bytes). Nula después del borrado.
    llavePublica: bytea('llave_publica'),
    // HU-307.
    huella: bytea('huella'),
    // "Chrome en Android": lo que ve el equipo. Se conserva.
    modelo: text('modelo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    borrarAt: timestamp('borrar_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('dispositivos_navegador').on(t.eventoId, t.deviceIdHash)],
);

/**
 * Qué dispositivo tiene la entrada de cada asistente, con su historial (HU-306, Modelo §5).
 * **Un dispositivo por invitado** (V17): una sola vinculación activa por asistente, y un
 * dispositivo activo en una sola entrada.
 */
export const vinculaciones = pgTable(
  'vinculaciones',
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
    dispositivoId: uuid('dispositivo_id')
      .notNull()
      .references(() => dispositivos.id),
    metodo: text('metodo').notNull(),
    invitacionId: uuid('invitacion_id').references(() => invitaciones.id),
    tokenId: uuid('token_id').references(() => tokens.id),
    registradorId: uuid('registrador_id').references(() => usuarios.id),
    anuladaAt: timestamp('anulada_at', { withTimezone: true }),
    anuladaPor: uuid('anulada_por').references(() => usuarios.id),
    motivoAnulacion: text('motivo_anulacion'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'vinculaciones_metodo',
      sql`${t.metodo} in ('enlace', 'qr_puerta', 'enlace_corto', 'autoregistro')`,
    ),
    uniqueIndex('vinculaciones_activa')
      .on(t.asistenteId)
      .where(sql`${t.anuladaAt} is null`),
    uniqueIndex('vinculaciones_dispositivo_activo')
      .on(t.dispositivoId)
      .where(sql`${t.anuladaAt} is null`),
    index('vinculaciones_dispositivo').on(t.dispositivoId),
  ],
);

/**
 * La respuesta de cada operación con `Idempotency-Key` (API §2.1, ajuste 2 de la fase 3). La
 * misma clave con el mismo cuerpo devuelve la misma respuesta; con otro cuerpo, un error. Global,
 * sin RLS: solo ids y la respuesta. Se borra a las 24 h.
 */
export const idempotencia = pgTable(
  'idempotencia',
  {
    actor: text('actor').notNull(),
    clave: uuid('clave').notNull(),
    ruta: text('ruta').notNull(),
    hashCuerpo: bytea('hash_cuerpo').notNull(),
    estadoHttp: integer('estado_http'),
    respuesta: jsonb('respuesta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.actor, t.clave] }), index('idempotencia_vieja').on(t.createdAt)],
);

/**
 * Lo técnico de cada momento sensible (HU-307, Acceso §6): vincular, reclamar, canjear, enviar una
 * foto y los intentos fallidos. Solo para detectar trampas: el equipo nunca ve la IP ni las
 * señales crudas. Se borra a los 30 días del cierre (`borrar_at`).
 */
export const registrosTecnicos = pgTable(
  'registros_tecnicos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    dispositivoId: uuid('dispositivo_id').references(() => dispositivos.id),
    asistenteId: uuid('asistente_id').references(() => asistentes.id),
    momento: text('momento').notNull(),
    resultado: text('resultado').notNull(),
    motivo: text('motivo'),
    ip: text('ip'),
    // Proveedor de la red (ASN), si el proxy lo manda.
    red: text('red'),
    userAgent: text('user_agent'),
    senales: jsonb('senales'),
    diferenciaRelojMs: integer('diferencia_reloj_ms'),
    latenciaMs: integer('latencia_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    borrarAt: timestamp('borrar_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      'registros_tecnicos_momento',
      sql`${t.momento} in ('vinculacion', 'reclamo', 'canje', 'foto', 'intento_fallido')`,
    ),
    check('registros_tecnicos_resultado', sql`${t.resultado} in ('aceptado', 'rechazado')`),
    index('registros_tecnicos_evento').on(t.eventoId, t.createdAt),
    index('registros_tecnicos_dispositivo').on(t.dispositivoId),
    index('registros_tecnicos_borrar').on(t.borrarAt),
  ],
);

/**
 * Alertas de trampa del evento (HU-307 y HU-318, Acceso §6.2): A1…A11 y los *No fui yo*. **Solo
 * avisan, nunca bloquean.** `datos` dice con qué se cruzó (ids, nunca la IP ni la huella).
 */
export const alertas = pgTable(
  'alertas',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    tipo: text('tipo').notNull(),
    asistenteId: uuid('asistente_id').references(() => asistentes.id),
    dispositivoId: uuid('dispositivo_id').references(() => dispositivos.id),
    datos: jsonb('datos').notNull().default({}),
    // Una misma situación no repite la alerta (por ejemplo, el par de asistentes de una A1).
    clave: text('clave'),
    prioridad: text('prioridad').notNull().default('normal'),
    estado: text('estado').notNull().default('abierta'),
    atendidaPor: uuid('atendida_por').references(() => usuarios.id),
    atendidaAt: timestamp('atendida_at', { withTimezone: true }),
    resolucion: text('resolucion'),
    nota: text('nota'),
    resueltaAt: timestamp('resuelta_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'alertas_tipo',
      sql`${t.tipo} in ('A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'no_fui_yo')`,
    ),
    check('alertas_prioridad', sql`${t.prioridad} in ('normal', 'alta')`),
    check(
      'alertas_estado',
      sql`${t.estado} in ('abierta', 'atendiendo', 'derivada', 'resuelta', 'descartada')`,
    ),
    uniqueIndex('alertas_clave').on(t.eventoId, t.clave),
    index('alertas_evento').on(t.eventoId, t.estado, t.createdAt),
  ],
);

/**
 * La llegada de cada invitado (HU-301, Modelo §5). **No se duplica:** un solo check-in activo por
 * asistente. Deshacerlo lo marca anulado y resta la bienvenida con una anulación en el libro.
 */
export const checkIns = pgTable(
  'check_ins',
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
    metodo: text('metodo').notNull(),
    registradorId: uuid('registrador_id').references(() => usuarios.id),
    // HU-319: el QR de registro del autorregistro.
    qrRegistroId: uuid('qr_registro_id'),
    movimientoId: uuid('movimiento_id')
      .notNull()
      .references(() => movimientos.id),
    anuladoAt: timestamp('anulado_at', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => usuarios.id),
    motivoAnulacion: text('motivo_anulacion'),
    movimientoAnulacionId: uuid('movimiento_anulacion_id').references(() => movimientos.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'check_ins_metodo',
      sql`${t.metodo} in ('escaneo_entrada', 'busqueda', 'registro_puerta', 'vinculacion_puerta', 'autoregistro_equipo', 'autoregistro_tablet', 'autoregistro_impreso', 'verificacion_ci')`,
    ),
    uniqueIndex('check_ins_activo')
      .on(t.asistenteId)
      .where(sql`${t.anuladoAt} is null`),
    index('check_ins_evento').on(t.eventoId, t.createdAt),
  ],
);

/**
 * Cada QR que mostró una pantalla (HU-314 §1), informado en tandas por la tablet. Sirve para el
 * historial de la pantalla (HU-315) y la alerta A6.
 */
export const qrEmitidos = pgTable(
  'qr_emitidos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    pantallaId: uuid('pantalla_id')
      .notNull()
      .references(() => pantallas.id),
    retoId: uuid('reto_id')
      .notNull()
      .references(() => retos.id),
    modo: text('modo').notNull(),
    epoca: integer('epoca').notNull(),
    franja: integer('franja'),
    nonce: text('nonce'),
    inicioAt: timestamp('inicio_at', { withTimezone: true }).notNull(),
    finAt: timestamp('fin_at', { withTimezone: true }),
    finMotivo: text('fin_motivo'),
    invalidadoPor: uuid('invalidado_por').references(() => usuarios.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('qr_emitidos_modo', sql`${t.modo} in ('por_tiempo', 'un_uso')`),
    check(
      'qr_emitidos_fin_motivo',
      sql`${t.finMotivo} is null or ${t.finMotivo} in ('vencio', 'usado', 'invalidado', 'pausa')`,
    ),
    check('qr_emitidos_franja_o_nonce', sql`(${t.franja} is null) <> (${t.nonce} is null)`),
    index('qr_emitidos_pantalla').on(t.pantallaId, t.inicioAt),
  ],
);

/**
 * Cada intento de reclamar un QR de reto (HU-310), aceptado o rechazado, con su latencia. Un nonce
 * de un solo uso se acepta **una sola vez** por pantalla (índice único parcial).
 */
export const escaneos = pgTable(
  'escaneos',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    pantallaId: uuid('pantalla_id').references(() => pantallas.id),
    retoId: uuid('reto_id').references(() => retos.id),
    asistenteId: uuid('asistente_id').references(() => asistentes.id),
    dispositivoId: uuid('dispositivo_id').references(() => dispositivos.id),
    qrEpoca: integer('qr_epoca'),
    qrFranja: integer('qr_franja'),
    qrNonce: text('qr_nonce'),
    metodo: text('metodo').notNull().default('qr'),
    resultado: text('resultado').notNull(),
    movimientoId: uuid('movimiento_id').references(() => movimientos.id),
    latenciaMs: integer('latencia_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('escaneos_metodo', sql`${t.metodo} in ('qr')`),
    check(
      'escaneos_resultado',
      sql`${t.resultado} in ('aceptado', 'firma_invalida', 'evento_no_activo', 'vencido', 'ya_usado', 'fuera_de_horario', 'solo_para_grupo', 'sin_check_in', 'ya_completado', 'agotado', 'dispositivo_anulado', 'error')`,
    ),
    uniqueIndex('escaneos_nonce_aceptado')
      .on(t.pantallaId, t.qrNonce)
      .where(sql`${t.resultado} = 'aceptado' and ${t.qrNonce} is not null`),
    index('escaneos_evento').on(t.eventoId, t.createdAt),
    index('escaneos_asistente').on(t.asistenteId),
  ],
);

/**
 * Los QR de registro (HU-319, D60): con ellos la gente crea su cuenta sola. Con RLS; al abrirlos se
 * busca su organización con el rol de sistema. El rotativo firma cada franja de 30 s con su
 * secreto (que no sale del servidor); el fijo lleva un token, guardado como hash y cifrado para
 * volver a descargarlo. `usuario_id` es la persona del equipo que lo muestra en su celular.
 */
export const qrRegistro = pgTable(
  'qr_registro',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    nombre: text('nombre').notNull(),
    tipo: text('tipo').notNull(),
    muestra: text('muestra').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    pantallaId: uuid('pantalla_id').references(() => pantallas.id),
    // HU-325: quien entra por este QR queda en el grupo.
    grupoId: uuid('grupo_id').references(() => grupos.id),
    marcaPresente: boolean('marca_presente').notNull().default(true),
    tope: integer('tope'),
    desde: timestamp('desde', { withTimezone: true }),
    hasta: timestamp('hasta', { withTimezone: true }),
    tokenHash: bytea('token_hash').unique(),
    tokenCifrado: bytea('token_cifrado'),
    secretoCifrado: bytea('secreto_cifrado'),
    estado: text('estado').notNull().default('activo'),
    invalidadoPor: uuid('invalidado_por').references(() => usuarios.id),
    invalidadoAt: timestamp('invalidado_at', { withTimezone: true }),
    motivoInvalidacion: text('motivo_invalidacion'),
    registros: integer('registros').notNull().default(0),
    createdBy: uuid('created_by').references(() => usuarios.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('qr_registro_nombre').on(t.eventoId, t.nombre),
    check('qr_registro_nombre_largo', sql`char_length(${t.nombre}) between 2 and 60`),
    check('qr_registro_tipo', sql`${t.tipo} in ('rotativo', 'fijo')`),
    check('qr_registro_muestra', sql`${t.muestra} in ('miembro', 'pantalla', 'impreso')`),
    check('qr_registro_muestra_tipo', sql`(${t.tipo} = 'fijo') = (${t.muestra} = 'impreso')`),
    check(
      'qr_registro_quien_muestra',
      sql`(${t.muestra} <> 'miembro' or ${t.usuarioId} is not null) and (${t.muestra} <> 'pantalla' or ${t.pantallaId} is not null)`,
    ),
    check(
      'qr_registro_secretos',
      sql`(${t.tipo} = 'fijo' and ${t.tokenHash} is not null and ${t.tokenCifrado} is not null and ${t.secretoCifrado} is null) or (${t.tipo} = 'rotativo' and ${t.secretoCifrado} is not null and ${t.tokenHash} is null)`,
    ),
    check('qr_registro_tope', sql`${t.tope} is null or ${t.tope} between 1 and 100000`),
    check(
      'qr_registro_vigencia',
      sql`${t.desde} is null or ${t.hasta} is null or ${t.desde} < ${t.hasta}`,
    ),
    check('qr_registro_estado', sql`${t.estado} in ('activo', 'invalidado')`),
    check(
      'qr_registro_motivo',
      sql`${t.motivoInvalidacion} is null or char_length(${t.motivoInvalidacion}) between 5 and 300`,
    ),
    check('qr_registro_registros', sql`${t.registros} >= 0`),
    // Una tablet muestra un solo QR de registro activo.
    uniqueIndex('qr_registro_pantalla_activa')
      .on(t.pantallaId)
      .where(sql`${t.estado} = 'activo' and ${t.pantallaId} is not null`),
    index('qr_registro_evento').on(t.eventoId),
    index('qr_registro_usuario').on(t.usuarioId),
  ],
);

/**
 * Las fotos de los retos (HU-322): cada intento de una persona en un reto. La imagen es un
 * archivo `foto_reto`, que se procesa en el trabajador. Se revisa en HU-323. Con RLS.
 */
export const enviosFoto = pgTable(
  'envios_foto',
  {
    id: uuid('id').primaryKey(),
    organizacionId: uuid('organizacion_id')
      .notNull()
      .references(() => organizaciones.id),
    eventoId: uuid('evento_id')
      .notNull()
      .references(() => eventos.id),
    retoId: uuid('reto_id')
      .notNull()
      .references(() => retos.id),
    asistenteId: uuid('asistente_id')
      .notNull()
      .references(() => asistentes.id),
    dispositivoId: uuid('dispositivo_id').references(() => dispositivos.id),
    intento: integer('intento').notNull(),
    archivoId: uuid('archivo_id')
      .notNull()
      .references(() => archivos.id),
    origen: text('origen').notNull(),
    estado: text('estado').notNull().default('recibida'),
    tomadaPor: uuid('tomada_por').references(() => usuarios.id),
    tomadaHasta: timestamp('tomada_hasta', { withTimezone: true }),
    revisadaPor: uuid('revisada_por').references(() => usuarios.id),
    revisadaAt: timestamp('revisada_at', { withTimezone: true }),
    motivoRechazo: text('motivo_rechazo'),
    nota: text('nota'),
    movimientoId: uuid('movimiento_id').references(() => movimientos.id),
    firmaDispositivo: bytea('firma_dispositivo'),
    sha256: text('sha256'),
    hashPerceptual: bytea('hash_perceptual'),
    autorizaUso: boolean('autoriza_uso').notNull().default(false),
    autorizaUsoAt: timestamp('autoriza_uso_at', { withTimezone: true }),
    autorizaUsoRetiradaAt: timestamp('autoriza_uso_retirada_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('envios_foto_intento').on(t.retoId, t.asistenteId, t.intento),
    check('envios_foto_origen', sql`${t.origen} in ('camara', 'galeria')`),
    check(
      'envios_foto_estado',
      sql`${t.estado} in ('recibida', 'en_revision', 'rechazada_sistema', 'aprobada', 'rechazada', 'anulada')`,
    ),
    check('envios_foto_intento_positivo', sql`${t.intento} >= 1`),
    // Una sola foto esperando revisión por persona y reto.
    uniqueIndex('envios_foto_pendiente')
      .on(t.retoId, t.asistenteId)
      .where(sql`${t.estado} in ('recibida', 'en_revision')`),
    index('envios_foto_cola').on(t.eventoId, t.estado, t.createdAt),
    index('envios_foto_asistente').on(t.asistenteId),
  ],
);
