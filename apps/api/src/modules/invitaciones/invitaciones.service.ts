import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  aceptacionesTerminos,
  miembrosOrganizacion,
  organizaciones,
  tokens,
  usuarios,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, VERSION_TERMINOS } from '@pasitos/dominio';
import { MENSAJES_PASSWORD_INSEGURA } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import { createTokenAleatorio, hashToken, type PropositoToken } from '../auth/auth.repository';
import { hashPassword } from '../auth/password';
import { checkPassword, type PasswordsFiltradasPort } from '../auth/passwords-filtradas';
import type { ContextoSesion, Reloj } from '../auth/sesiones.service';
import { BitacoraService } from '../bitacora/bitacora.service';

export const INVITACION_MS = 7 * 24 * 60 * 60 * 1000;

export type PropositoInvitacion = Extract<
  PropositoToken,
  'invitacion_organizacion' | 'invitacion_plataforma' | 'invitacion_equipo'
>;

/** Lo que muestra la pantalla de la invitación antes de aceptar. */
export interface DescripcionInvitacion {
  readonly tipo: 'organizacion' | 'plataforma' | 'equipo';
  readonly email: string;
  readonly rol: string;
  readonly quienInvita: string | null;
  readonly organizacion: string | null;
  readonly evento: {
    readonly nombre: string;
    readonly inicioAt: Date;
    readonly finAt: Date;
  } | null;
  /** A qué app lleva después de aceptar. */
  readonly app: 'admin' | 'plataforma';
}

/**
 * Cada tipo de invitación sabe describirse y aceptarse. HU-202 registra la de organización y la
 * de plataforma; HU-203, la del equipo del evento.
 */
export interface TipoInvitacion {
  readonly proposito: PropositoInvitacion;
  describe(tx: Tx, refId: string): Promise<DescripcionInvitacion | null>;
  accept(
    tx: Tx,
    refId: string,
    usuario: { id: string; nombre: string },
    ahora: Date,
  ): Promise<void>;
}

/** "a•••@gmail.com", para el error de otra cuenta. */
export function maskEmail(email: string): string {
  const [local = '', dominio = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${dominio}`;
}

/**
 * Invitaciones por enlace (HU-202 §2, HU-203 §3): token de 7 días en `tokens`; abrir el enlace
 * del correo prueba que el correo es suyo (D26). Sin cuenta: define nombre y contraseña. Con
 * cuenta: tiene que entrar con **ese** correo.
 */
export class InvitacionesService {
  private readonly tipos = new Map<PropositoInvitacion, TipoInvitacion>();

  constructor(
    private readonly sistema: Db,
    private readonly filtradas: PasswordsFiltradasPort,
    private readonly reloj: Reloj,
  ) {}

  register(tipo: TipoInvitacion): void {
    this.tipos.set(tipo.proposito, tipo);
  }

  /** Crea el token (revoca el anterior del mismo destino) y devuelve el que va en el enlace. */
  async createToken(tx: Tx, proposito: PropositoInvitacion, refId: string): Promise<string> {
    const ahora = this.reloj.now();
    await tx
      .update(tokens)
      .set({ revocadoAt: ahora })
      .where(
        and(
          eq(tokens.proposito, proposito),
          eq(tokens.refId, refId),
          isNull(tokens.usadoAt),
          isNull(tokens.revocadoAt),
        ),
      );
    const { token, hash } = createTokenAleatorio();
    await tx.insert(tokens).values({
      id: uuidv7(),
      proposito,
      refId,
      tokenHash: hash,
      expiraAt: new Date(ahora.getTime() + INVITACION_MS),
    });
    return token;
  }

  /** Revoca la invitación pendiente de un destino (al quitar o reemplazar). */
  async revokeToken(tx: Tx, proposito: PropositoInvitacion, refId: string): Promise<void> {
    await tx
      .update(tokens)
      .set({ revocadoAt: this.reloj.now() })
      .where(
        and(
          eq(tokens.proposito, proposito),
          eq(tokens.refId, refId),
          isNull(tokens.usadoAt),
          isNull(tokens.revocadoAt),
        ),
      );
  }

  /** `GET /auth/invitaciones/:token`. No consume el token. */
  async describe(token: string): Promise<DescripcionInvitacion & { tieneCuenta: boolean }> {
    return this.sistema.transaction(async (tx) => {
      const { tipo, fila } = await this.findVigente(tx, token, false);
      const descripcion = await tipo.describe(tx, fila.refId ?? '');
      if (!descripcion) {
        throw new AppError('ENLACE_VENCIDO');
      }
      const [usuario] = await tx
        .select({ passwordHash: usuarios.passwordHash })
        .from(usuarios)
        .where(eq(usuarios.email, descripcion.email));
      return { ...descripcion, tieneCuenta: Boolean(usuario?.passwordHash) };
    });
  }

  /**
   * `POST /auth/invitaciones/:token/aceptar`. Devuelve el usuario y si hay que crearle una
   * sesión (no la tenía). El token se marca usado en la misma transacción.
   */
  async accept(
    token: string,
    datos: {
      nombre?: string | undefined;
      password?: string | undefined;
      aceptaTerminos?: true | undefined;
    },
    sesion: ContextoSesion | null,
  ): Promise<{ usuarioId: string; crearSesion: boolean; app: 'admin' | 'plataforma' }> {
    // La contraseña se revisa antes de la transacción (puede consultar HIBP).
    const passwordHash = datos.password ? await this.hashPasswordNueva(datos.password) : null;
    const ahora = this.reloj.now();
    return this.sistema.transaction(async (tx) => {
      const { tipo, fila } = await this.findVigente(tx, token, true);
      const descripcion = await tipo.describe(tx, fila.refId ?? '');
      if (!descripcion) {
        throw new AppError('ENLACE_VENCIDO');
      }
      const [existente] = await tx
        .select()
        .from(usuarios)
        .where(eq(usuarios.email, descripcion.email))
        .for('update');

      let usuario: { id: string; nombre: string };
      let crearSesion = false;
      if (existente?.passwordHash) {
        // Con cuenta: entra con ese mismo correo.
        if (!sesion) {
          throw new AppError('NO_AUTENTICADO', {
            detail: 'Entra con tu cuenta para aceptar la invitación.',
          });
        }
        if (sesion.usuario.id !== existente.id) {
          throw new AppError('INVITACION_EQUIPO_OTRO_CORREO', {
            detail: `Esta invitación es para ${maskEmail(descripcion.email)}. Entra con esa cuenta.`,
          });
        }
        usuario = existente;
      } else {
        const nombre = datos.nombre?.trim();
        if (!nombre || !passwordHash || !datos.aceptaTerminos) {
          throw new AppError('VALIDACION', {
            errors: [
              ...(!datos.aceptaTerminos
                ? [
                    {
                      field: 'aceptaTerminos',
                      code: 'REQUERIDO',
                      message: 'Para crear tu cuenta, acepta los términos.',
                    },
                  ]
                : []),
              ...(!nombre
                ? [{ field: 'nombre', code: 'REQUERIDO', message: 'Escribe tu nombre.' }]
                : []),
              ...(!passwordHash
                ? [{ field: 'password', code: 'REQUERIDO', message: 'Elige una contraseña.' }]
                : []),
            ],
          });
        }
        const id = existente?.id ?? uuidv7();
        if (existente) {
          await tx
            .update(usuarios)
            .set({
              nombre,
              passwordHash,
              emailVerificadoAt: ahora,
              passwordCambiadaAt: ahora,
              updatedAt: ahora,
            })
            .where(eq(usuarios.id, id));
        } else {
          await tx.insert(usuarios).values({
            id,
            email: descripcion.email,
            nombre,
            passwordHash,
            emailVerificadoAt: ahora,
            passwordCambiadaAt: ahora,
          });
        }
        await tx.insert(aceptacionesTerminos).values(
          (['terminos', 'privacidad'] as const).map((documento) => ({
            id: uuidv7(),
            usuarioId: id,
            documento,
            version: VERSION_TERMINOS,
            createdAt: ahora,
          })),
        );
        usuario = { id, nombre };
        crearSesion = true;
      }
      await tx.update(tokens).set({ usadoAt: ahora }).where(eq(tokens.id, fila.id));
      await tipo.accept(tx, fila.refId ?? '', usuario, ahora);
      return { usuarioId: usuario.id, crearSesion, app: descripcion.app };
    });
  }

  private async findVigente(tx: Tx, token: string, bloquear: boolean) {
    const consulta = tx
      .select()
      .from(tokens)
      .where(eq(tokens.tokenHash, hashToken(token)));
    const [fila] = bloquear ? await consulta.for('update') : await consulta;
    const tipo = fila ? this.tipos.get(fila.proposito as PropositoInvitacion) : undefined;
    if (!fila || !tipo || !fila.refId) {
      throw new AppError('ENLACE_VENCIDO');
    }
    if (fila.usadoAt) {
      throw new AppError('ENLACE_YA_USADO');
    }
    if (fila.revocadoAt || fila.expiraAt <= this.reloj.now()) {
      throw new AppError('ENLACE_VENCIDO');
    }
    return { tipo, fila };
  }

  private async hashPasswordNueva(password: string): Promise<string> {
    const motivo = await checkPassword(password, this.filtradas);
    if (motivo) {
      throw new AppError('PASSWORD_INSEGURA', {
        meta: { motivo },
        detail: MENSAJES_PASSWORD_INSEGURA[motivo],
      });
    }
    return hashPassword(password);
  }
}

/** Invitación a ser dueño de una organización (HU-202 §2). `refId` = la fila de `miembros_organizacion`. */
export function createTipoOrganizacion(): TipoInvitacion {
  const bitacora = new BitacoraService();
  return {
    proposito: 'invitacion_organizacion',
    async describe(tx, refId) {
      const [fila] = await tx
        .select({
          email: miembrosOrganizacion.emailInvitado,
          estado: miembrosOrganizacion.estado,
          organizacion: organizaciones.nombre,
          quienInvita: usuarios.nombre,
        })
        .from(miembrosOrganizacion)
        .innerJoin(organizaciones, eq(organizaciones.id, miembrosOrganizacion.organizacionId))
        .leftJoin(usuarios, eq(usuarios.id, miembrosOrganizacion.invitadoPor))
        .where(eq(miembrosOrganizacion.id, refId));
      if (!fila?.email || fila.estado !== 'invitado') {
        return null;
      }
      return {
        tipo: 'organizacion',
        email: fila.email,
        rol: 'dueno',
        quienInvita: fila.quienInvita,
        organizacion: fila.organizacion,
        evento: null,
        app: 'admin',
      };
    },
    async accept(tx, refId, usuario, ahora) {
      const [miembro] = await tx
        .update(miembrosOrganizacion)
        .set({ usuarioId: usuario.id, estado: 'activo', aceptadoAt: ahora })
        .where(eq(miembrosOrganizacion.id, refId))
        .returning({ organizacionId: miembrosOrganizacion.organizacionId });
      if (!miembro) {
        throw new AppError('ENLACE_VENCIDO');
      }
      // Al cambiar de dueño, el anterior deja de serlo recién ahora (HU-202 §2).
      await tx
        .update(miembrosOrganizacion)
        .set({ estado: 'revocado', revocadoAt: ahora })
        .where(
          and(
            eq(miembrosOrganizacion.organizacionId, miembro.organizacionId),
            eq(miembrosOrganizacion.estado, 'activo'),
            ne(miembrosOrganizacion.id, refId),
          ),
        );
      await bitacora.record(tx, {
        actor: { tipo: 'usuario', id: usuario.id, nombre: usuario.nombre, rol: 'dueno' },
        accion: 'organizacion.dueno.accept',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'organizacion', id: miembro.organizacionId, nombre: usuario.nombre },
      });
    },
  };
}

/** Invitación a la consola (HU-202 §4). `refId` = el usuario, creado con su rol y sin contraseña. */
export function createTipoPlataforma(): TipoInvitacion {
  const bitacora = new BitacoraService();
  return {
    proposito: 'invitacion_plataforma',
    async describe(tx, refId) {
      const [fila] = await tx
        .select({ email: usuarios.email, rol: usuarios.rolPlataforma })
        .from(usuarios)
        .where(eq(usuarios.id, refId));
      if (!fila?.rol) {
        return null;
      }
      return {
        tipo: 'plataforma',
        email: fila.email,
        rol: fila.rol,
        quienInvita: null,
        organizacion: null,
        evento: null,
        app: 'plataforma',
      };
    },
    async accept(tx, refId, usuario) {
      await bitacora.record(tx, {
        actor: { tipo: 'usuario', id: usuario.id, nombre: usuario.nombre, rol: null },
        accion: 'plataforma.usuario.accept',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'usuario', id: refId, nombre: usuario.nombre },
      });
    },
  };
}
