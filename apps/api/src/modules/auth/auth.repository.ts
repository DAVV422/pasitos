import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  miembrosOrganizacion,
  passkeys,
  sessions,
  tokens,
  usuarios,
  type Db,
  type Tx,
} from '@pasitos/db';
import { uuidv7 } from 'uuidv7';

type Ejecutor = Db | Tx;

export type Usuario = typeof usuarios.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;
export type PropositoToken =
  | 'restablecer_password'
  | 'desafio_webauthn'
  | 'configurar_totp'
  | 'invitacion_organizacion'
  | 'invitacion_plataforma'
  | 'invitacion_equipo';

/** Token de 32 bytes aleatorios para el navegador; en la base solo su SHA-256. */
export function createTokenAleatorio(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export interface SesionConUsuario {
  readonly sesion: typeof sessions.$inferSelect;
  readonly usuario: Usuario;
}

/**
 * Lo que guarda y lee la autenticación (HU-201). Las tablas son globales y sin RLS (`usuarios`,
 * `sessions`, `tokens`, `passkeys`): las lee pasitos_app. Solo `isSegundoFactorRequerido` mira
 * tablas de organización, con la conexión de sistema.
 */
export class AuthRepository {
  constructor(
    private readonly db: Db,
    private readonly sistema: Db,
  ) {}

  transaction<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(trabajo);
  }

  // ── Usuarios ────────────────────────────────────────────────────────────────

  async findUsuarioByEmail(email: string): Promise<Usuario | undefined> {
    const [fila] = await this.db.select().from(usuarios).where(eq(usuarios.email, email));
    return fila;
  }

  async findUsuario(id: string, ejecutor: Ejecutor = this.db): Promise<Usuario | undefined> {
    const [fila] = await ejecutor.select().from(usuarios).where(eq(usuarios.id, id));
    return fila;
  }

  async findUsuarioForUpdate(tx: Tx, id: string): Promise<Usuario | undefined> {
    const [fila] = await tx.select().from(usuarios).where(eq(usuarios.id, id)).for('update');
    return fila;
  }

  async updateIntentos(
    id: string,
    intentosFallidos: number,
    bloqueadoHasta: Date | null,
    ejecutor: Ejecutor = this.db,
  ): Promise<void> {
    await ejecutor
      .update(usuarios)
      .set({ intentosFallidos, bloqueadoHasta, updatedAt: sql`now()` })
      .where(eq(usuarios.id, id));
  }

  async updatePassword(tx: Tx, id: string, passwordHash: string, ahora: Date): Promise<void> {
    await tx
      .update(usuarios)
      .set({
        passwordHash,
        passwordCambiadaAt: ahora,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        updatedAt: ahora,
      })
      .where(eq(usuarios.id, id));
  }

  /**
   * ¿Necesita segundo factor? (HU-201 §4): tiene rol de plataforma o es dueño de una
   * organización. HU-203 suma a dueños y coorganizadores de eventos activos.
   */
  async isSegundoFactorRequerido(usuario: Usuario): Promise<boolean> {
    if (usuario.rolPlataforma !== null) {
      return true;
    }
    const [fila] = await this.sistema
      .select({ id: miembrosOrganizacion.id })
      .from(miembrosOrganizacion)
      .where(
        and(
          eq(miembrosOrganizacion.usuarioId, usuario.id),
          eq(miembrosOrganizacion.estado, 'activo'),
        ),
      )
      .limit(1);
    return fila !== undefined;
  }

  // ── Sesiones ────────────────────────────────────────────────────────────────

  async insertSession(
    nueva: {
      usuarioId: string;
      tokenHash: Buffer;
      dispositivo: string;
      expiraAt: Date;
      ahora: Date;
    },
    ejecutor: Ejecutor = this.db,
  ): Promise<string> {
    const id = uuidv7();
    const { ahora, ...resto } = nueva;
    await ejecutor
      .insert(sessions)
      .values({ id, tipo: 'usuario', ...resto, ultimoUsoAt: ahora, createdAt: ahora });
    return id;
  }

  async findSessionByHash(tokenHash: Buffer): Promise<SesionConUsuario | undefined> {
    const [fila] = await this.db
      .select({ sesion: sessions, usuario: usuarios })
      .from(sessions)
      .innerJoin(usuarios, eq(usuarios.id, sessions.usuarioId))
      .where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.tipo, 'usuario')));
    return fila;
  }

  async touchSession(id: string, ahora: Date): Promise<void> {
    await this.db.update(sessions).set({ ultimoUsoAt: ahora }).where(eq(sessions.id, id));
  }

  async markSegundoFactor(sessionId: string, ahora: Date, ejecutor: Ejecutor = this.db) {
    await ejecutor
      .update(sessions)
      .set({ segundoFactorAt: ahora, ultimoUsoAt: ahora })
      .where(eq(sessions.id, sessionId));
  }

  listSessions(usuarioId: string, desde: Date, ahora: Date) {
    return this.db
      .select({
        id: sessions.id,
        dispositivo: sessions.dispositivo,
        createdAt: sessions.createdAt,
        ultimoUsoAt: sessions.ultimoUsoAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.usuarioId, usuarioId),
          eq(sessions.tipo, 'usuario'),
          isNull(sessions.revocadaAt),
          gt(sessions.ultimoUsoAt, desde),
          gt(sessions.expiraAt, ahora),
        ),
      )
      .orderBy(desc(sessions.ultimoUsoAt));
  }

  /** Devuelve si había una sesión de ese usuario para revocar. */
  async revokeSession(id: string, usuarioId: string, ahora: Date): Promise<boolean> {
    const filas = await this.db
      .update(sessions)
      .set({ revocadaAt: ahora })
      .where(
        and(eq(sessions.id, id), eq(sessions.usuarioId, usuarioId), isNull(sessions.revocadaAt)),
      )
      .returning({ id: sessions.id });
    return filas.length > 0;
  }

  /** Todas las sesiones del usuario, salvo `exceptoId` si se indica. */
  async revokeSessions(
    usuarioId: string,
    ahora: Date,
    exceptoId: string | null,
    ejecutor: Ejecutor = this.db,
  ): Promise<void> {
    await ejecutor
      .update(sessions)
      .set({ revocadaAt: ahora })
      .where(
        and(
          eq(sessions.usuarioId, usuarioId),
          isNull(sessions.revocadaAt),
          exceptoId ? ne(sessions.id, exceptoId) : undefined,
        ),
      );
  }

  // ── Tokens de un solo uso ───────────────────────────────────────────────────

  /** Crea un token y revoca los anteriores del mismo propósito para el mismo `refId`. */
  async insertToken(
    nuevo: {
      proposito: PropositoToken;
      refId: string;
      tokenHash: Buffer;
      expiraAt: Date;
      secretoCifrado?: Buffer;
    },
    ahora: Date,
    ejecutor: Ejecutor = this.db,
  ): Promise<void> {
    await ejecutor
      .update(tokens)
      .set({ revocadoAt: ahora })
      .where(
        and(
          eq(tokens.proposito, nuevo.proposito),
          eq(tokens.refId, nuevo.refId),
          isNull(tokens.usadoAt),
          isNull(tokens.revocadoAt),
        ),
      );
    await ejecutor.insert(tokens).values({
      id: uuidv7(),
      proposito: nuevo.proposito,
      refId: nuevo.refId,
      tokenHash: nuevo.tokenHash,
      expiraAt: nuevo.expiraAt,
      secretoCifrado: nuevo.secretoCifrado ?? null,
    });
  }

  /** Bloquea la fila: dos usos al mismo tiempo no pasan los dos. */
  async findTokenForUpdate(tx: Tx, tokenHash: Buffer, proposito: PropositoToken) {
    const [fila] = await tx
      .select()
      .from(tokens)
      .where(and(eq(tokens.tokenHash, tokenHash), eq(tokens.proposito, proposito)))
      .for('update');
    return fila;
  }

  /** El último vigente de un propósito para un `refId` (TOTP por confirmar, desafío WebAuthn). */
  async findTokenVigenteForUpdate(tx: Tx, proposito: PropositoToken, refId: string, ahora: Date) {
    const [fila] = await tx
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.proposito, proposito),
          eq(tokens.refId, refId),
          isNull(tokens.usadoAt),
          isNull(tokens.revocadoAt),
          gt(tokens.expiraAt, ahora),
        ),
      )
      .orderBy(desc(tokens.createdAt))
      .limit(1)
      .for('update');
    return fila;
  }

  async markTokenUsado(tx: Tx, id: string, ahora: Date): Promise<void> {
    await tx.update(tokens).set({ usadoAt: ahora }).where(eq(tokens.id, id));
  }

  // ── Segundo factor ──────────────────────────────────────────────────────────

  async setTotp(tx: Tx, usuarioId: string, secretoCifrado: Buffer | null, paso: number | null) {
    await tx
      .update(usuarios)
      .set({ totpSecretCifrado: secretoCifrado, totpUltimoPaso: paso, updatedAt: sql`now()` })
      .where(eq(usuarios.id, usuarioId));
  }

  /**
   * Guarda el paso usado solo si es posterior al último: si dos pedidos traen el mismo código a la
   * vez, uno solo actualiza la fila (y gana).
   */
  async claimPasoTotp(usuarioId: string, paso: number): Promise<boolean> {
    const filas = await this.db
      .update(usuarios)
      .set({ totpUltimoPaso: paso })
      .where(
        and(
          eq(usuarios.id, usuarioId),
          or(isNull(usuarios.totpUltimoPaso), lt(usuarios.totpUltimoPaso, paso)),
        ),
      )
      .returning({ id: usuarios.id });
    return filas.length > 0;
  }

  listPasskeys(usuarioId: string, ejecutor: Ejecutor = this.db): Promise<Passkey[]> {
    return ejecutor
      .select()
      .from(passkeys)
      .where(eq(passkeys.usuarioId, usuarioId))
      .orderBy(passkeys.createdAt);
  }

  async countPasskeys(usuarioId: string, ejecutor: Ejecutor = this.db): Promise<number> {
    return ejecutor.$count(passkeys, eq(passkeys.usuarioId, usuarioId));
  }

  async insertPasskey(tx: Tx, nueva: Omit<typeof passkeys.$inferInsert, 'id'>): Promise<string> {
    const id = uuidv7();
    await tx.insert(passkeys).values({ id, ...nueva });
    return id;
  }

  async findPasskeyByCredential(usuarioId: string, credentialId: Buffer) {
    const [fila] = await this.db
      .select()
      .from(passkeys)
      .where(and(eq(passkeys.usuarioId, usuarioId), eq(passkeys.credentialId, credentialId)));
    return fila;
  }

  /** Sube el contador solo si es mayor (una respuesta copiada no pasa dos veces). */
  async updateContadorPasskey(id: string, contador: number, ahora: Date): Promise<boolean> {
    const filas = await this.db
      .update(passkeys)
      .set({ contador, ultimoUsoAt: ahora })
      .where(
        and(
          eq(passkeys.id, id),
          or(lt(passkeys.contador, contador), eq(passkeys.contador, 0), sql`${contador} = 0`),
        ),
      )
      .returning({ id: passkeys.id });
    return filas.length > 0;
  }

  async deletePasskey(tx: Tx, id: string, usuarioId: string): Promise<boolean> {
    const filas = await tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.usuarioId, usuarioId)))
      .returning({ id: passkeys.id });
    return filas.length > 0;
  }
}
