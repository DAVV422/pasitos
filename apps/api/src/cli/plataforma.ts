/**
 * Acciones de la consola de plataforma mientras no existe la consola (HU-202). Lo corre una persona de
 * Pasitos; cada acción queda en la bitácora con el mismo servicio que usará la consola.
 *
 *   pnpm plataforma crear-admin --email <correo> --nombre "…"   (solo el primero: superadmin)
 *   pnpm plataforma intervalo --evento <slug> --minutos <2|5|10|15|30|plataforma> --motivo "…"
 *
 * `crear-admin` pide la contraseña sin mostrarla (dos veces). Sin terminal interactiva, la lee de
 * PASITOS_ADMIN_PASSWORD. Nunca se pasa como argumento: quedaría en el historial de la consola.
 * `--minutos plataforma` vuelve al valor de ANCLAJE_INTERVALO_MIN.
 */
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { AppError, INTERVALOS_ANCLAJE_MIN, type IntervaloAnclajeMin } from '@pasitos/dominio';
import { createConexion, eventos, type Db } from '@pasitos/db';
import { loadCliConfig } from '../config/cli.config';
import {
  checkPasswordLargo,
  hashPassword,
  PASSWORD_LARGO_MAX,
  PASSWORD_LARGO_MIN,
} from '../modules/auth/password';
import {
  EventosPlataformaService,
  type ActorPlataforma,
} from '../modules/plataforma/eventos-plataforma.service';
import { UsuariosPlataformaService } from '../modules/plataforma/usuarios-plataforma.service';

const USO = [
  'Uso:',
  '  pnpm plataforma crear-admin --email <correo> --nombre "…"',
  `  pnpm plataforma intervalo --evento <slug> --minutos <${INTERVALOS_ANCLAJE_MIN.join('|')}|plataforma> --motivo "…"`,
].join('\n');

const COMANDO: ActorPlataforma = {
  tipo: 'sistema',
  id: null,
  nombre: 'Soporte de Pasitos (comando)',
  rol: null,
};

type Valores = Partial<Record<'evento' | 'minutos' | 'motivo' | 'email' | 'nombre', string>>;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      evento: { type: 'string' },
      minutos: { type: 'string' },
      motivo: { type: 'string' },
      email: { type: 'string' },
      nombre: { type: 'string' },
    },
  });
  const comando = positionals[0];
  if (comando !== 'intervalo' && comando !== 'crear-admin') {
    throw new Error(USO);
  }
  // Valida los argumentos antes de pedir la contraseña o abrir la conexión.
  const accion =
    comando === 'intervalo' ? await prepareIntervalo(values) : await prepareCrearAdmin(values);

  const conexion = createConexion(loadCliConfig().DATABASE_URL_SISTEMA, { max: 2 });
  try {
    await accion(conexion.db);
  } finally {
    await conexion.pool.end();
  }
}

async function prepareIntervalo(values: Valores): Promise<(db: Db) => Promise<void>> {
  const motivo = values.motivo?.trim();
  if (!values.evento || !values.minutos || !motivo) {
    throw new Error(USO);
  }
  const slug = values.evento;
  const minutos =
    values.minutos === 'plataforma' ? null : (Number(values.minutos) as IntervaloAnclajeMin);
  return async (db) => {
    const [evento] = await db
      .select({ id: eventos.id })
      .from(eventos)
      .where(eq(eventos.slug, slug));
    if (!evento) {
      throw new Error(`No existe el evento "${slug}"`);
    }
    await new EventosPlataformaService(db).updateIntervaloAnclaje(
      evento.id,
      minutos,
      COMANDO,
      motivo,
    );
    process.stdout.write(
      `Intervalo de anclaje: ${minutos === null ? 'el de la plataforma' : `${minutos} min`}. Vale desde el próximo ciclo del sellador.\n`,
    );
  };
}

async function prepareCrearAdmin(values: Valores): Promise<(db: Db) => Promise<void>> {
  const { email, nombre } = values;
  if (!email || !nombre) {
    throw new Error(USO);
  }
  const password = await readPassword();
  const motivo = checkPasswordLargo(password);
  if (motivo) {
    throw new Error(
      `La contraseña tiene que tener entre ${PASSWORD_LARGO_MIN} y ${PASSWORD_LARGO_MAX} caracteres.`,
    );
  }
  const passwordHash = await hashPassword(password);
  return async (db) => {
    await new UsuariosPlataformaService(db).createSuperadmin(
      { email, nombre, passwordHash },
      COMANDO,
    );
    process.stdout.write(
      'Primer administrador creado. Al entrar por primera vez a /plataforma va a configurar su segundo factor; desde ahí nombra a los demás administradores.\n',
    );
  };
}

/** Dos veces y sin eco en una terminal; de PASITOS_ADMIN_PASSWORD si no hay terminal. */
async function readPassword(): Promise<string> {
  const desdeEntorno = process.env['PASITOS_ADMIN_PASSWORD'];
  if (desdeEntorno) {
    return desdeEntorno;
  }
  if (!process.stdin.isTTY) {
    throw new Error('Sin terminal interactiva: define PASITOS_ADMIN_PASSWORD.');
  }
  const primera = await promptOculto('Contraseña: ');
  const segunda = await promptOculto('Repite la contraseña: ');
  if (primera !== segunda) {
    throw new Error('Las contraseñas no coinciden.');
  }
  return primera;
}

function promptOculto(pregunta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    let texto = '';
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const terminar = (error?: Error) => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.off('data', leer);
      process.stdout.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(texto);
      }
    };
    const leer = (trozo: string) => {
      for (const caracter of trozo) {
        if (caracter === '\r' || caracter === '\n') {
          terminar();
          return;
        }
        if (caracter === '\u0003') {
          terminar(new Error('Cancelado.'));
          return;
        }
        if (caracter === '\u007f' || caracter === '\b') {
          texto = [...texto].slice(0, -1).join('');
        } else {
          texto += caracter;
        }
      }
    };
    entrada.on('data', leer);
  });
}

main().catch((error: unknown) => {
  const mensaje =
    error instanceof AppError
      ? `${error.code}${error.errors?.[0] ? `: ${error.errors[0].message}` : ''}`
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`Error: ${mensaje}\n`);
  process.exit(1);
});
