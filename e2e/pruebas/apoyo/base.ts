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
