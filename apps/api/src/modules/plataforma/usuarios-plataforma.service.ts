import { eq } from 'drizzle-orm';
import { AppError } from '@pasitos/dominio';
import { bitacora, usuarios, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';
import type { ActorPlataforma } from './eventos-plataforma.service';

export const ROLES_PLATAFORMA = ['admin', 'soporte'] as const;
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
 * Personas de Pasitos (`rol_plataforma`). El primer administrador lo crea `pnpm plataforma
 * crear-admin`; los siguientes, un administrador desde la consola (HU-202 §5).
 */
export class UsuariosPlataformaService {
  constructor(private readonly db: Db) {}

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
      await tx.insert(bitacora).values({
        id: uuidv7(),
        organizacionId: null,
        eventoId: null,
        actorTipo: actor.tipo,
        actorId: actor.id,
        actorNombre: actor.nombre,
        actorRol: actor.rol,
        accion: 'plataforma.usuario.create',
        objetoTipo: 'usuario',
        objetoId: id,
        objetoNombre: nombre,
        despues: { rolPlataforma: nuevo.rol },
      });
      return id;
    });
  }
}
