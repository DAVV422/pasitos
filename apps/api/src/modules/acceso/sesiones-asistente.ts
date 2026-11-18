import { and, eq, isNull } from 'drizzle-orm';
import {
  dispositivos,
  sessions,
  vinculaciones,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { ContextoAsistente } from '../../common/sesion/asistente';
import { createTokenAleatorio, hashToken } from '../auth/auth.repository';
import type { Reloj } from '../auth/sesiones.service';

export const COOKIE_ASISTENTE = 'px_asistente';
/** La tercera copia del id del navegador (Acceso §5): la escribe la app, no es `HttpOnly`. */
export const COOKIE_DISPOSITIVO = 'px_device';
/** La sesión dura hasta 30 días después del cierre del evento (D43). */
export const DIAS_DESPUES_DEL_CIERRE = 30;
const TOQUE_CADA_MS = 5 * 60 * 1000;

/** El contexto, con la llave del dispositivo para verificar las firmas. */
export interface SesionAsistente extends ContextoAsistente {
  readonly llavePublica: Buffer | null;
}

export function getVencimientoSesion(finEvento: Date): Date {
  return new Date(finEvento.getTime() + DIAS_DESPUES_DEL_CIERRE * 24 * 60 * 60 * 1000);
}

/**
 * Sesiones de los asistentes (HU-306 §3, API §2). Viven en `sessions` (global) con el id de la
 * vinculación y la organización; el resto se lee con RLS. Sin vencimiento por inactividad: el
 * celular queda dentro hasta 30 días después del cierre.
 */
export class SesionesAsistenteService {
  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  async create(
    tx: Tx,
    datos: { vinculacionId: string; organizacionId: string; expiraAt: Date; modelo: string },
  ): Promise<string> {
    const { token, hash } = createTokenAleatorio();
    const ahora = this.reloj.now();
    await tx.insert(sessions).values({
      id: uuidv7(),
      tipo: 'asistente',
      tokenHash: hash,
      vinculacionId: datos.vinculacionId,
      asistenteOrganizacionId: datos.organizacionId,
      dispositivo: datos.modelo,
      ultimoUsoAt: ahora,
      createdAt: ahora,
      expiraAt: datos.expiraAt,
    });
    return token;
  }

  /** Revoca las sesiones de una vinculación (al anularla). */
  async revokeDeVinculacion(tx: Tx, vinculacionId: string): Promise<void> {
    await tx
      .update(sessions)
      .set({ revocadaAt: this.reloj.now() })
      .where(and(eq(sessions.vinculacionId, vinculacionId), isNull(sessions.revocadaAt)));
  }

  /**
   * La sesión de la cookie. Si su vinculación se anuló (otro celular abrió la entrada), responde
   * `DISPOSITIVO_NO_VINCULADO` con cuándo y cómo, para la pantalla de *anulado* (HU-312).
   */
  async authenticate(token: string | undefined): Promise<SesionAsistente> {
    if (!token) {
      throw new AppError('NO_AUTENTICADO');
    }
    const [sesion] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), eq(sessions.tipo, 'asistente')));
    if (!sesion?.vinculacionId || !sesion.asistenteOrganizacionId) {
      throw new AppError('NO_AUTENTICADO');
    }
    const { vinculacionId, asistenteOrganizacionId: organizacionId } = sesion;
    const vinculacion = await withOrganizacion(this.db, organizacionId, async (tx) => {
      const [fila] = await tx
        .select({
          id: vinculaciones.id,
          eventoId: vinculaciones.eventoId,
          asistenteId: vinculaciones.asistenteId,
          dispositivoId: vinculaciones.dispositivoId,
          anuladaAt: vinculaciones.anuladaAt,
          llavePublica: dispositivos.llavePublica,
        })
        .from(vinculaciones)
        .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
        .where(eq(vinculaciones.id, vinculacionId));
      if (!fila?.anuladaAt) {
        return fila;
      }
      // Cómo se vinculó el celular nuevo: "Tu entrada se abrió en otro celular el 21/11 a las 10:42".
      const [nueva] = await tx
        .select({ metodo: vinculaciones.metodo })
        .from(vinculaciones)
        .where(
          and(eq(vinculaciones.asistenteId, fila.asistenteId), isNull(vinculaciones.anuladaAt)),
        );
      throw new AppError('DISPOSITIVO_NO_VINCULADO', {
        meta: { anuladaAt: fila.anuladaAt.toISOString(), metodo: nueva?.metodo ?? null },
      });
    });
    if (!vinculacion || sesion.revocadaAt !== null) {
      throw new AppError('NO_AUTENTICADO');
    }
    const ahora = this.reloj.now();
    if (sesion.expiraAt <= ahora) {
      throw new AppError('SESION_VENCIDA');
    }
    if (ahora.getTime() - sesion.ultimoUsoAt.getTime() >= TOQUE_CADA_MS) {
      await this.db.update(sessions).set({ ultimoUsoAt: ahora }).where(eq(sessions.id, sesion.id));
    }
    return {
      sessionId: sesion.id,
      organizacionId,
      eventoId: vinculacion.eventoId,
      asistenteId: vinculacion.asistenteId,
      vinculacionId: vinculacion.id,
      dispositivoId: vinculacion.dispositivoId,
      llavePublica: vinculacion.llavePublica,
    };
  }
}
