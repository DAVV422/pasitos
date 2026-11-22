import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Algorithm, hash } from '@node-rs/argon2';
import { Client } from 'pg';
import { uuidv7 } from 'uuidv7';

/**
 * Acceso directo a la base desde las pruebas de punta a punta: crear personas del equipo y leer
 * los correos encolados (en el CI no hay trabajador: el enlace sale de la cola). Usa
 * pasitos_sistema, como la semilla.
 */
function getUrlSistema(): string {
  const desdeEntorno = process.env['DATABASE_URL_SISTEMA'];
  if (desdeEntorno) {
    return desdeEntorno;
  }
  const env = readFileSync(resolve(__dirname, '../../../.env'), 'utf-8');
  const linea = env.split('\n').find((l) => l.startsWith('DATABASE_URL_SISTEMA='));
  if (!linea) {
    throw new Error('Falta DATABASE_URL_SISTEMA');
  }
  return linea.slice('DATABASE_URL_SISTEMA='.length).trim();
}

async function withCliente<T>(trabajo: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: getUrlSistema() });
  await cliente.connect();
  try {
    return await trabajo(cliente);
  } finally {
    await cliente.end();
  }
}

/** Una persona con contraseña; con `dueno`, dueña de una organización (necesita segundo factor). */
export async function createPersona(opciones: {
  email: string;
  password: string;
  nombre: string;
  dueno?: boolean;
  rolPlataforma?: 'admin' | 'soporte';
}): Promise<void> {
  const passwordHash = await hash(opciones.password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  await withCliente(async (cliente) => {
    const usuarioId = uuidv7();
    await cliente.query(
      `insert into usuarios (id, email, nombre, password_hash, email_verificado_at, rol_plataforma)
       values ($1, $2, $3, $4, now(), $5)`,
      [usuarioId, opciones.email, opciones.nombre, passwordHash, opciones.rolPlataforma ?? null],
    );
    if (opciones.dueno) {
      const organizacionId = uuidv7();
      await cliente.query('insert into organizaciones (id, nombre, slug) values ($1, $2, $3)', [
        organizacionId,
        'Organización e2e',
        `e2e-${organizacionId}`,
      ]);
      await cliente.query(
        `insert into miembros_organizacion (id, organizacion_id, usuario_id, rol)
         values ($1, $2, $3, 'dueno')`,
        [uuidv7(), organizacionId, usuarioId],
      );
    }
  });
}

/** El enlace del último correo de ese tipo para ese destinatario. */
export function getEnlaceCorreo(destinatario: string, tipo: string): Promise<string> {
  return withCliente(async (cliente) => {
    const { rows } = await cliente.query<{ enlace: string }>(
      `select datos->>'enlace' as enlace from envios_correo
        where destinatario = $1 and tipo = $2 order by created_at desc limit 1`,
      [destinatario, tipo],
    );
    const enlace = rows[0]?.enlace;
    if (!enlace) {
      throw new Error(`No hay un correo ${tipo}`);
    }
    return enlace;
  });
}

/** Un correo único por corrida. Los datos de prueba son inventados. */
export function createEmailPrueba(prefijo: string): string {
  return `${prefijo}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
}

/** Una IP de prueba (rango de documentación, RFC 5737) para el límite por IP. */
export function createIpPrueba(): string {
  return `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
}

/**
 * Cambia el estado del evento directo en la base: publicarlo de verdad pide el contrato en
 * Stellar, que las pruebas de punta a punta no tienen.
 */
export function setEstadoEvento(eventoId: string, estado: 'publicado' | 'en_curso'): Promise<void> {
  return withCliente(async (cliente) => {
    await cliente.query('update eventos set estado = $1 where id = $2', [estado, eventoId]);
  });
}

/** Lo que arma `seedEventoConFoto` para la prueba de las fotos. */
export interface EventoConFoto {
  readonly eventoId: string;
  readonly retoId: string;
  readonly asistenteId: string;
  /** El enlace de invitación del asistente: `/app/acceso/invitacion/<token>`. */
  readonly token: string;
}

/**
 * Un evento en curso con un reto de foto (20 puntos, 3 intentos), un asistente presente con su
 * invitación y un registrador responsable del reto (HU-322 a HU-324). Los datos son inventados.
 */
export function seedEventoConFoto(responsable: { email: string }): Promise<EventoConFoto> {
  return withCliente(async (cliente) => {
    const organizacionId = uuidv7();
    const eventoId = uuidv7();
    const retoId = uuidv7();
    const asistenteId = uuidv7();
    const miembroId = uuidv7();
    await cliente.query('insert into organizaciones (id, nombre, slug) values ($1, $2, $3)', [
      organizacionId,
      'Organización fotos e2e',
      `e2e-fotos-${organizacionId}`,
    ]);
    await cliente.query(
      `insert into eventos (id, organizacion_id, slug, nombre, tipo, estado, inicio_at, fin_at)
       values ($1, $2, $3, 'Feria de fotos e2e', 'prueba', 'en_curso', now() - interval '1 hour',
               now() + interval '8 hours')`,
      [eventoId, organizacionId, `fotos-e2e-${eventoId.slice(-12)}`],
    );
    await cliente.query(
      `insert into retos (id, organizacion_id, evento_id, nombre, tipo, puntos, tope_total,
                          instruccion_foto, autorizacion_uso, intentos_max)
       values ($1, $2, $3, 'Foto con la mascota', 'foto', 20, 100,
               'Una foto con la mascota del evento', 'opcional', 3)`,
      [retoId, organizacionId, eventoId],
    );
    await cliente.query(
      `insert into asistentes (id, organizacion_id, evento_id, codigo_asistente, nombre, estado)
       values ($1, $2, $3, 'A-0001', 'Valeria Quispe', 'presente')`,
      [asistenteId, organizacionId, eventoId],
    );
    const token = randomBytes(32).toString('base64url');
    await cliente.query(
      `insert into invitaciones (id, organizacion_id, evento_id, asistente_id, token_hash,
                                 token_cifrado, estado)
       values ($1, $2, $3, $4, $5, $6, 'enviada')`,
      [
        uuidv7(),
        organizacionId,
        eventoId,
        asistenteId,
        createHash('sha256').update(token, 'utf8').digest(),
        Buffer.from('cifrado-de-prueba'),
      ],
    );
    const { rows } = await cliente.query<{ id: string }>(
      'select id from usuarios where email = $1',
      [responsable.email],
    );
    await cliente.query(
      `insert into miembros_evento (id, organizacion_id, evento_id, usuario_id, email_invitado, rol,
                                    estado, aceptado_at)
       values ($1, $2, $3, $4, $5, 'registrador', 'activo', now())`,
      [miembroId, organizacionId, eventoId, rows[0]?.id, responsable.email],
    );
    await cliente.query(
      `insert into reto_responsables (reto_id, miembro_id, organizacion_id, evento_id)
       values ($1, $2, $3, $4)`,
      [retoId, miembroId, organizacionId, eventoId],
    );
    return { eventoId, retoId, asistenteId, token };
  });
}

/**
 * Procesa una vez las fotos recibidas, como el trabajador (que en estas pruebas no corre). Corre
 * desde `e2e/`, igual que el API: los dos ven la misma carpeta de archivos.
 */
export function processFotos(): void {
  execSync(
    'npx tsx --env-file=../.env --tsconfig ../tsconfig.base.json ../apps/trabajador/src/cli/procesar-fotos.ts',
    { cwd: resolve(__dirname, '../..'), stdio: 'pipe' },
  );
}

/**
 * Un evento `real` y *Público*, publicado y próximo, para la sección *Eventos* (HU-405). Con
 * `visibilidad`, uno que no debe aparecer. Empieza en una hora: así queda primero entre los
 * próximos, y los de corridas anteriores ya no son próximos.
 */
export function seedEventoPublico(
  nombre: string,
  visibilidad: 'publico' | 'privado' = 'publico',
): Promise<string> {
  return withCliente(async (cliente) => {
    const organizacionId = uuidv7();
    const eventoId = uuidv7();
    await cliente.query('insert into organizaciones (id, nombre, slug) values ($1, $2, $3)', [
      organizacionId,
      'Comunidad pública e2e',
      `e2e-publica-${organizacionId}`,
    ]);
    const slug = `publico-e2e-${eventoId.slice(-12)}`;
    await cliente.query(
      `insert into eventos (id, organizacion_id, slug, nombre, tipo, estado, visibilidad,
                            inicio_at, fin_at)
       values ($1, $2, $3, $4, 'real', 'publicado', $5, now() + interval '1 hour',
               now() + interval '9 hours')`,
      [eventoId, organizacionId, slug, nombre, visibilidad],
    );
    return slug;
  });
}

/**
 * Un evento `real`, *Público* y en curso, con un asistente presente y su invitación, para *Ir a mi
 * entrada* (HU-406). Devuelve el slug y el token de la invitación.
 */
export function seedEventoPublicoConInvitado(
  nombre: string,
): Promise<{ slug: string; token: string }> {
  return withCliente(async (cliente) => {
    const organizacionId = uuidv7();
    const eventoId = uuidv7();
    const asistenteId = uuidv7();
    await cliente.query('insert into organizaciones (id, nombre, slug) values ($1, $2, $3)', [
      organizacionId,
      'Comunidad pública e2e',
      `e2e-publica-${organizacionId}`,
    ]);
    const slug = `publico-e2e-${eventoId.slice(-12)}`;
    await cliente.query(
      `insert into eventos (id, organizacion_id, slug, nombre, tipo, estado, visibilidad,
                            inicio_at, fin_at)
       values ($1, $2, $3, $4, 'real', 'en_curso', 'publico', now() - interval '1 hour',
               now() + interval '8 hours')`,
      [eventoId, organizacionId, slug, nombre],
    );
    await cliente.query(
      `insert into asistentes (id, organizacion_id, evento_id, codigo_asistente, nombre, estado)
       values ($1, $2, $3, 'A-0001', 'Valeria Quispe', 'presente')`,
      [asistenteId, organizacionId, eventoId],
    );
    const token = randomBytes(32).toString('base64url');
    await cliente.query(
      `insert into invitaciones (id, organizacion_id, evento_id, asistente_id, token_hash,
                                 token_cifrado, estado)
       values ($1, $2, $3, $4, $5, $6, 'enviada')`,
      [
        uuidv7(),
        organizacionId,
        eventoId,
        asistenteId,
        createHash('sha256').update(token, 'utf8').digest(),
        Buffer.from('cifrado-de-prueba'),
      ],
    );
    return { slug, token };
  });
}

/**
 * Un evento `real` y *Público* ya cerrado, de la organización de esa persona (dueña), con tres
 * presentes y un reto completado, para el reporte (HU-402). Los datos son inventados. Devuelve el
 * id y el slug.
 */
export function seedEventoCerrado(
  duena: { email: string },
  nombre: string,
): Promise<{ eventoId: string; slug: string }> {
  return withCliente(async (cliente) => {
    const { rows } = await cliente.query<{ organizacion_id: string }>(
      `select m.organizacion_id from miembros_organizacion m join usuarios u on u.id = m.usuario_id
        where u.email = $1 and m.rol = 'dueno'`,
      [duena.email],
    );
    const organizacionId = rows[0]?.organizacion_id;
    if (!organizacionId) throw new Error('La persona no es dueña de una organización');
    const eventoId = uuidv7();
    const retoId = uuidv7();
    const slug = `cerrado-e2e-${eventoId.slice(-12)}`;
    await cliente.query(
      `insert into eventos (id, organizacion_id, slug, nombre, tipo, estado, visibilidad,
                            inicio_at, fin_at, cerrado_at, cierre_estado)
       values ($1, $2, $3, $4, 'real', 'cerrado', 'publico', now() - interval '9 hours',
               now() - interval '1 hour', now() - interval '30 minutes', 'listo')`,
      [eventoId, organizacionId, slug, nombre],
    );
    await cliente.query(
      `insert into retos (id, organizacion_id, evento_id, numero, nombre, puntos, tope_total)
       values ($1, $2, $3, 1, 'Visita el stand de ejemplo', 10, 100)`,
      [retoId, organizacionId, eventoId],
    );
    for (let i = 1; i <= 3; i++) {
      const asistenteId = uuidv7();
      const movimientoId = uuidv7();
      await cliente.query(
        `insert into asistentes (id, organizacion_id, evento_id, codigo_asistente, nombre, estado)
         values ($1, $2, $3, $4, $5, 'presente')`,
        [asistenteId, organizacionId, eventoId, `A-000${i}`, `Persona Inventada ${i}`],
      );
      await cliente.query(
        `insert into movimientos (id, organizacion_id, evento_id, asistente_id, tipo, puntos, origen,
                                  created_at)
         values ($1, $2, $3, $4, 'checkin', 0, 'equipo', now() - interval '8 hours')`,
        [movimientoId, organizacionId, eventoId, asistenteId],
      );
      await cliente.query(
        `insert into check_ins (id, organizacion_id, evento_id, asistente_id, metodo, movimiento_id,
                                created_at)
         values ($1, $2, $3, $4, 'escaneo_entrada', $5, now() - interval '8 hours')`,
        [uuidv7(), organizacionId, eventoId, asistenteId, movimientoId],
      );
      await cliente.query(
        `insert into movimientos (id, organizacion_id, evento_id, asistente_id, tipo, puntos,
                                  reto_id, origen, created_at)
         values ($1, $2, $3, $4, 'reto', 10, $5, 'asistente', now() - interval '5 hours')`,
        [uuidv7(), organizacionId, eventoId, asistenteId, retoId],
      );
    }
    return { eventoId, slug };
  });
}

/**
 * Un evento en curso de la organización de esa persona (dueña), con una asistente presente con
 * 100 puntos, un reto de foto y un premio de 30 puntos, para *Ajustes* (HU-412). Datos inventados.
 */
export function seedEventoParaAjustes(
  duena: { email: string },
  nombre: string,
): Promise<{ eventoId: string; codigo: string; asistente: string; premio: string; reto: string }> {
  return withCliente(async (cliente) => {
    const { rows } = await cliente.query<{ organizacion_id: string }>(
      `select m.organizacion_id from miembros_organizacion m join usuarios u on u.id = m.usuario_id
        where u.email = $1 and m.rol = 'dueno'`,
      [duena.email],
    );
    const organizacionId = rows[0]?.organizacion_id;
    if (!organizacionId) throw new Error('La persona no es dueña de una organización');
    const eventoId = uuidv7();
    const asistenteId = uuidv7();
    const asistente = 'Paula Inventada';
    const premio = 'Taza de ejemplo';
    const reto = 'Foto en el stand de ejemplo';
    await cliente.query(
      `insert into eventos (id, organizacion_id, slug, nombre, tipo, estado, inicio_at, fin_at,
                            retos_requieren_check_in)
       values ($1, $2, $3, $4, 'real', 'en_curso', now() - interval '1 hour',
               now() + interval '6 hours', false)`,
      [eventoId, organizacionId, `ajustes-e2e-${eventoId.slice(-12)}`, nombre],
    );
    await cliente.query(
      `insert into retos (id, organizacion_id, evento_id, numero, nombre, tipo, instruccion_foto,
                          puntos, tope_total)
       values ($1, $2, $3, 1, $4, 'foto', 'Una foto en el stand de ejemplo.', 20, 100)`,
      [uuidv7(), organizacionId, eventoId, reto],
    );
    await cliente.query(
      `insert into premios (id, organizacion_id, evento_id, nombre, puntos, stock_total, estado)
       values ($1, $2, $3, $4, 30, 10, 'activo')`,
      [uuidv7(), organizacionId, eventoId, premio],
    );
    await cliente.query(
      `insert into asistentes (id, organizacion_id, evento_id, codigo_asistente, nombre, estado)
       values ($1, $2, $3, 'A-0001', $4, 'presente')`,
      [asistenteId, organizacionId, eventoId, asistente],
    );
    await cliente.query('update saldos set puntos = 100 where asistente_id = $1', [asistenteId]);
    return { eventoId, codigo: 'A-0001', asistente, premio, reto };
  });
}

/**
 * Un evento en curso (privado) de la organización de esa persona (dueña), con su **plano**, un
 * stand con su sponsor y una asistente invitada, para el mapa (HU-414). El plano es una imagen
 * gris armada aquí, guardada donde el API de las pruebas lee los archivos (`e2e/.archivos`).
 */
export async function seedEventoConPlano(
  duena: { email: string },
  nombre: string,
): Promise<{ eventoId: string; token: string; stand: string; sponsor: string }> {
  const { default: sharp } = await import('sharp');
  return withCliente(async (cliente) => {
    const { rows } = await cliente.query<{ organizacion_id: string }>(
      `select m.organizacion_id from miembros_organizacion m join usuarios u on u.id = m.usuario_id
        where u.email = $1 and m.rol = 'dueno'`,
      [duena.email],
    );
    const organizacionId = rows[0]?.organizacion_id;
    if (!organizacionId) throw new Error('La persona no es dueña de una organización');
    const eventoId = uuidv7();
    const planoId = uuidv7();
    const lugarId = uuidv7();
    const asistenteId = uuidv7();
    const stand = 'Stand de Café Ejemplo';
    const sponsor = 'Café de Ejemplo';
    await cliente.query(
      `insert into eventos (id, organizacion_id, slug, nombre, tipo, estado, inicio_at, fin_at)
       values ($1, $2, $3, $4, 'real', 'en_curso', now() - interval '1 hour',
               now() + interval '6 hours')`,
      [eventoId, organizacionId, `mapa-e2e-${eventoId.slice(-12)}`, nombre],
    );
    // El plano: 1200 × 800, gris claro, en sus tres tamaños.
    const relativa = `eventos/${organizacionId}/${eventoId}/${planoId}`;
    const carpeta = resolve(__dirname, '../../.archivos', relativa);
    mkdirSync(carpeta, { recursive: true });
    const imagen = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#e2e8f0' },
    })
      .webp()
      .toBuffer();
    const variantes: Record<string, string> = {};
    for (const variante of ['original', '1200', '400']) {
      writeFileSync(resolve(carpeta, `${variante}.webp`), imagen);
      variantes[variante] = `${relativa}/${variante}.webp`;
    }
    await cliente.query(
      `insert into archivos (id, organizacion_id, evento_id, proposito, nombre_original, mime,
                             tamano_bytes, ancho, alto, estado, variantes)
       values ($1, $2, $3, 'plano', 'plano.webp', 'image/webp', $4, 1200, 800, 'aprobado', $5)`,
      [planoId, organizacionId, eventoId, imagen.length, JSON.stringify(variantes)],
    );
    await cliente.query('update eventos set plano_archivo_id = $1 where id = $2', [
      planoId,
      eventoId,
    ]);
    await cliente.query(
      `insert into lugares (id, organizacion_id, evento_id, tipo, nombre, numero_mapa)
       values ($1, $2, $3, 'stand', $4, 7)`,
      [lugarId, organizacionId, eventoId, stand],
    );
    await cliente.query(
      `insert into sponsors (id, organizacion_id, evento_id, nombre, lugar_id)
       values ($1, $2, $3, $4, $5)`,
      [uuidv7(), organizacionId, eventoId, sponsor, lugarId],
    );
    await cliente.query(
      `insert into asistentes (id, organizacion_id, evento_id, codigo_asistente, nombre, estado)
       values ($1, $2, $3, 'A-0001', 'Paula Inventada', 'presente')`,
      [asistenteId, organizacionId, eventoId],
    );
    const token = randomBytes(32).toString('base64url');
    await cliente.query(
      `insert into invitaciones (id, organizacion_id, evento_id, asistente_id, token_hash,
                                 token_cifrado, estado)
       values ($1, $2, $3, $4, $5, $6, 'enviada')`,
      [
        uuidv7(),
        organizacionId,
        eventoId,
        asistenteId,
        createHash('sha256').update(token, 'utf8').digest(),
        Buffer.from('cifrado-de-prueba'),
      ],
    );
    return { eventoId, token, stand, sponsor };
  });
}

/** La latitud y la longitud guardadas del evento (Configuración → Ubicación). */
export function getUbicacionEvento(
  eventoId: string,
): Promise<{ lat: number | null; lng: number | null }> {
  return withCliente(async (cliente) => {
    const { rows } = await cliente.query<{ lat: number | null; lng: number | null }>(
      'select ubicacion_lat as lat, ubicacion_lng as lng from eventos where id = $1',
      [eventoId],
    );
    return rows[0] ?? { lat: null, lng: null };
  });
}
