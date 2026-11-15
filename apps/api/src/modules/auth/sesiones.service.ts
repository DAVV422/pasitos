import { AppError } from '@pasitos/dominio';
import { AuthRepository, createTokenAleatorio, hashToken, type Usuario } from './auth.repository';

/** El panel vence a las 12 h sin uso (HU-201 §3). */
export const INACTIVIDAD_MS = 12 * 60 * 60 * 1000;
/** Tope absoluto de una sesión del equipo, aunque se use todos los días. */
export const DURACION_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;
/** `ultimo_uso_at` se escribe como mucho una vez cada 5 minutos. */
const TOQUE_CADA_MS = 5 * 60 * 1000;
/** La consola de plataforma pide de nuevo el segundo factor cada 8 h (D43). */
export const SEGUNDO_FACTOR_PLATAFORMA_MS = 8 * 60 * 60 * 1000;

export const COOKIE_EQUIPO = 'px_equipo';

export type MetodoSegundoFactor = 'totp' | 'passkey';

/**
 * - `no_aplica`: no lo necesita y no lo configuró.
 * - `por_configurar`: lo necesita y no lo configuró: solo puede configurarlo.
 * - `por_verificar`: lo configuró y no lo pasó en esta sesión.
 * - `ok`: lo pasó.
 */
export type EstadoSegundoFactor = 'no_aplica' | 'por_configurar' | 'por_verificar' | 'ok';

export interface ContextoSesion {
  readonly sessionId: string;
  readonly usuario: Pick<Usuario, 'id' | 'email' | 'nombre' | 'rolPlataforma'>;
  readonly segundoFactorAt: Date | null;
  /** "Chrome en Windows", para la bitácora (sin IP). */
  readonly dispositivo: string | null;
  readonly segundoFactor: {
    readonly requerido: boolean;
    readonly metodos: readonly MetodoSegundoFactor[];
    readonly estado: EstadoSegundoFactor;
  };
}

export interface Reloj {
  now(): Date;
}

export const RELOJ = Symbol('RELOJ');
export const RELOJ_SISTEMA: Reloj = { now: () => new Date() };

export class SesionesService {
  constructor(
    private readonly repositorio: AuthRepository,
    private readonly reloj: Reloj,
  ) {}

  async create(usuarioId: string, dispositivo: string): Promise<string> {
    const { token, hash } = createTokenAleatorio();
    const ahora = this.reloj.now();
    await this.repositorio.insertSession({
      usuarioId,
      tokenHash: hash,
      dispositivo,
      expiraAt: new Date(ahora.getTime() + DURACION_MAXIMA_MS),
      ahora,
    });
    return token;
  }

  /** La sesión de la cookie, o `NO_AUTENTICADO` / `SESION_VENCIDA`. */
  async authenticate(token: string | undefined): Promise<ContextoSesion> {
    if (!token) {
      throw new AppError('NO_AUTENTICADO');
    }
    const encontrada = await this.repositorio.findSessionByHash(hashToken(token));
    if (!encontrada || encontrada.sesion.revocadaAt !== null) {
      throw new AppError('NO_AUTENTICADO');
    }
    const { sesion, usuario } = encontrada;
    const ahora = this.reloj.now();
    if (
      sesion.expiraAt <= ahora ||
      sesion.ultimoUsoAt.getTime() + INACTIVIDAD_MS <= ahora.getTime() ||
      usuario.estado !== 'activo'
    ) {
      throw new AppError('SESION_VENCIDA');
    }
    if (ahora.getTime() - sesion.ultimoUsoAt.getTime() >= TOQUE_CADA_MS) {
      await this.repositorio.touchSession(sesion.id, ahora);
    }
    return this.buildContexto(sesion.id, usuario, sesion.segundoFactorAt, sesion.dispositivo);
  }

  async buildContexto(
    sessionId: string,
    usuario: Usuario,
    segundoFactorAt: Date | null,
    dispositivo: string | null = null,
  ): Promise<ContextoSesion> {
    const [requerido, cantidadPasskeys] = await Promise.all([
      this.repositorio.isSegundoFactorRequerido(usuario),
      this.repositorio.countPasskeys(usuario.id),
    ]);
    const metodos: MetodoSegundoFactor[] = [
      ...(cantidadPasskeys > 0 ? (['passkey'] as const) : []),
      ...(usuario.totpSecretCifrado ? (['totp'] as const) : []),
    ];
    // La consola de plataforma pide el segundo factor de nuevo cada 8 h (D43, HU-202 §1).
    const vigente =
      segundoFactorAt !== null &&
      (usuario.rolPlataforma === null ||
        this.reloj.now().getTime() - segundoFactorAt.getTime() < SEGUNDO_FACTOR_PLATAFORMA_MS);
    const estado: EstadoSegundoFactor =
      metodos.length === 0
        ? requerido
          ? 'por_configurar'
          : 'no_aplica'
        : vigente
          ? 'ok'
          : 'por_verificar';
    return {
      sessionId,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rolPlataforma: usuario.rolPlataforma,
      },
      segundoFactorAt,
      dispositivo,
      segundoFactor: { requerido, metodos, estado },
    };
  }

  /** Para la consola de plataforma: el segundo factor tiene menos de 8 h. */
  isSegundoFactorReciente(contexto: ContextoSesion): boolean {
    return (
      contexto.segundoFactorAt !== null &&
      this.reloj.now().getTime() - contexto.segundoFactorAt.getTime() < SEGUNDO_FACTOR_PLATAFORMA_MS
    );
  }

  list(usuarioId: string) {
    const ahora = this.reloj.now();
    return this.repositorio.listSessions(
      usuarioId,
      new Date(ahora.getTime() - INACTIVIDAD_MS),
      ahora,
    );
  }

  async revoke(id: string, usuarioId: string): Promise<void> {
    if (!(await this.repositorio.revokeSession(id, usuarioId, this.reloj.now()))) {
      throw new AppError('NO_ENCONTRADO');
    }
  }
}
