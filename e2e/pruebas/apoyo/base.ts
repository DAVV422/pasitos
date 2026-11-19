import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
