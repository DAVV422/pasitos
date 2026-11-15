import { eq } from 'drizzle-orm';
import { AppError } from '@pasitos/dominio';
import { usuarios, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';
import { BitacoraService, toActorBitacora } from '../bitacora/bitacora.service';
import type { ActorPlataforma } from './eventos-plataforma.service';

/**
 * `superadmin`: el primer administrador, el único que nombra a los demás (HU-202 §4); hay uno solo.
 * `admin`: todo lo demás de la consola. `soporte`: solo lectura.
 */
export const ROLES_PLATAFORMA = ['superadmin', 'admin', 'soporte'] as const;
export type RolPlataforma = (typeof ROLES_PLATAFORMA)[number];

export interface NuevoUsuarioPlataforma {
  readonly email: string;
  readonly nombre: string;
  /** Hash de Argon2id (`hashPassword`), nunca la contraseña. */
  readonly passwordHash: string;
  readonly rol: RolPlataforma;
}

/** Correo como se guarda y se busca: sin espacios y en minúsculas (HU-201 §3). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Personas de Pasitos (`rol_plataforma`). El primer administrador (`superadmin`) lo crea `pnpm
 * plataforma crear-admin`; a los demás los nombra él desde la consola (HU-202 §4).
 */
export class UsuariosPlataformaService {
  constructor(private readonly db: Db) {}

  /** El primer administrador. Si ya hay uno, `VALIDACION` (el índice único lo asegura también). */
  createSuperadmin(
    nuevo: Omit<NuevoUsuarioPlataforma, 'rol'>,
    actor: ActorPlataforma,
  ): Promise<string> {
    return this.createUsuario({ ...nuevo, rol: 'superadmin' }, actor);
  }

  async createUsuario(nuevo: NuevoUsuarioPlataforma, actor: ActorPlataforma): Promise<string> {
    const email = normalizeEmail(nuevo.email);
    const nombre = nuevo.nombre.trim();
    const errores = [
      ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? []
        : [{ field: 'email', code: 'FORMATO', message: 'El correo no es válido.' }]),
      ...(nombre.length >= 2 && nombre.length <= 80
        ? []
        : [{ field: 'nombre', code: 'LARGO', message: 'El nombre va de 2 a 80 caracteres.' }]),
    ];
    if (errores.length > 0) {
      throw new AppError('VALIDACION', { errors: errores });
    }

    return this.db.transaction(async (tx) => {
      const [existente] = await tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.email, email));
      if (nuevo.rol === 'superadmin') {
        const [superadmin] = await tx
          .select({ id: usuarios.id })
          .from(usuarios)
          .where(eq(usuarios.rolPlataforma, 'superadmin'));
        if (superadmin) {
          throw new AppError('VALIDACION', {
            errors: [
              {
                field: 'rol',
                code: 'YA_EXISTE',
                message:
                  'Ya hay un primer administrador; los demás los nombra él desde la consola.',
              },
            ],
          });
        }
      }
      if (existente) {
        throw new AppError('VALIDACION', {
          errors: [
            { field: 'email', code: 'YA_EXISTE', message: 'Ya hay un usuario con ese correo.' },
          ],
        });
      }
      const id = uuidv7();
      await tx.insert(usuarios).values({
        id,
        email,
        nombre,
        passwordHash: nuevo.passwordHash,
        // Quien lo crea responde por el correo: no hay registro abierto (HU-201, ajuste 9).
        emailVerificadoAt: new Date(),
        rolPlataforma: nuevo.rol,
      });
      // Sin el correo: la bitácora no guarda datos personales que no hagan falta.
      await new BitacoraService().record(tx, {
        actor: toActorBitacora(actor),
        accion: 'plataforma.usuario.create',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'usuario', id, nombre },
        despues: { rolPlataforma: nuevo.rol },
      });
      return id;
    });
  }
}
