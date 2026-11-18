import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  alertas,
  dispositivos,
  eventos,
  outbox,
  registrosTecnicos,
  vinculaciones,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { getCamposHuella, type SenalesDispositivo } from '@pasitos/dominio';
import { canonicalizeJson } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { getVencimientoSesion } from './sesiones-asistente';

export type MomentoTecnico = 'vinculacion' | 'reclamo' | 'canje' | 'foto' | 'intento_fallido';
export type TipoAlerta = `A${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}` | 'no_fui_yo';

/** `SHA-256(JCS(campos))` (HU-307 §2). Débil con muchos celulares iguales: solo alerta. */
export function getHuella(senales: SenalesDispositivo | undefined): Buffer | null {
  const campos = getCamposHuella(senales);
  return campos ? createHash('sha256').update(canonicalizeJson(campos), 'utf8').digest() : null;
}

/** Lo técnico de un pedido, sin datos personales más allá de la IP (que se borra a los 30 días). */
export interface DatosRegistro {
  readonly eventoId: string;
  readonly dispositivoId?: string | null;
  readonly asistenteId?: string | null;
  readonly momento: MomentoTecnico;
  readonly resultado: 'aceptado' | 'rechazado';
  readonly motivo?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly senales?: SenalesDispositivo | null;
  readonly diferenciaRelojMs?: number | null;
  readonly latenciaMs?: number | null;
}

export interface DatosAlerta {
  readonly eventoId: string;
  readonly tipo: TipoAlerta;
  readonly asistenteId?: string | null;
  readonly dispositivoId?: string | null;
  /** Con qué se cruzó: ids, **nunca** la IP ni la huella. */
  readonly datos?: Record<string, unknown>;
  /** La misma situación no repite la alerta. */
  readonly clave: string;
  readonly prioridad?: 'normal' | 'alta';
}

function toEntero(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  return Math.max(-2_000_000_000, Math.min(2_000_000_000, Math.round(valor)));
}

/**
 * El registro técnico y las alertas de trampa (HU-307). Cuando el caso de uso falla, el registro
 * se escribe **aparte** (`recordAparte`), para que el rechazo quede aunque su transacción se
 * deshaga. Un registro que no se pudo escribir nunca hace fallar el pedido.
 */
export class RegistroTecnicoService {
  private readonly logger = new Logger(RegistroTecnicoService.name);

  constructor(private readonly db: Db) {}

  async record(tx: Tx, organizacionId: string, datos: DatosRegistro): Promise<void> {
    const [evento] = await tx
      .select({ finAt: eventos.finAt })
      .from(eventos)
      .where(eq(eventos.id, datos.eventoId));
    if (!evento) return;
    await tx.insert(registrosTecnicos).values({
      id: uuidv7(),
      organizacionId,
      eventoId: datos.eventoId,
      dispositivoId: datos.dispositivoId ?? null,
      asistenteId: datos.asistenteId ?? null,
      momento: datos.momento,
      resultado: datos.resultado,
      motivo: datos.motivo ?? null,
      ip: datos.ip?.slice(0, 64) ?? null,
      userAgent: datos.userAgent?.slice(0, 400) ?? null,
      senales: datos.senales ?? null,
      diferenciaRelojMs: toEntero(datos.diferenciaRelojMs),
      latenciaMs: toEntero(datos.latenciaMs),
      // Cierre + 30 días; mientras no cierra, el fin del evento + 30 días (HU-409 lo ajusta).
      borrarAt: getVencimientoSesion(evento.finAt),
    });
  }

  /** En su propia transacción, y sin fallar nunca (queda en el log técnico, sin datos personales). */
  async recordAparte(
    organizacionId: string,
    datos: DatosRegistro,
    alerta?: DatosAlerta,
  ): Promise<void> {
    try {
      await withOrganizacion(this.db, organizacionId, async (tx) => {
        await this.record(tx, organizacionId, datos);
        if (alerta) {
          await this.raiseAlerta(tx, organizacionId, alerta);
        }
      });
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : 'desconocido', momento: datos.momento },
        'No se pudo guardar el registro técnico',
      );
    }
  }

  /** Crea la alerta si no existía una con la misma clave, y avisa al panel (`alerta.creada`). */
  async raiseAlerta(tx: Tx, organizacionId: string, alerta: DatosAlerta): Promise<boolean> {
    const id = uuidv7();
    const [creada] = await tx
      .insert(alertas)
      .values({
        id,
        organizacionId,
        eventoId: alerta.eventoId,
        tipo: alerta.tipo,
        asistenteId: alerta.asistenteId ?? null,
        dispositivoId: alerta.dispositivoId ?? null,
        datos: alerta.datos ?? {},
        clave: alerta.clave,
        prioridad: alerta.prioridad ?? 'normal',
      })
      .onConflictDoNothing({ target: [alertas.eventoId, alertas.clave] })
      .returning({ id: alertas.id });
    if (!creada) {
      return false;
    }
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'alerta.creada',
      eventoId: alerta.eventoId,
      payload: {
        eventoId: alerta.eventoId,
        alertaId: id,
        tipo: alerta.tipo,
        asistenteId: alerta.asistenteId ?? null,
        prioridad: alerta.prioridad ?? 'normal',
      },
    });
    return true;
  }

  /**
   * A1 (HU-307 §5): la misma huella ya está en la vinculación activa de **otro** asistente del
   * evento. Una sola alerta por par de asistentes.
   */
  async checkHuellaRepetida(
    tx: Tx,
    organizacionId: string,
    datos: { eventoId: string; asistenteId: string; dispositivoId: string; huella: Buffer },
  ): Promise<number> {
    const otros = await tx
      .select({ asistenteId: vinculaciones.asistenteId, dispositivoId: dispositivos.id })
      .from(vinculaciones)
      .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
      .where(
        and(
          eq(vinculaciones.eventoId, datos.eventoId),
          isNull(vinculaciones.anuladaAt),
          ne(vinculaciones.asistenteId, datos.asistenteId),
          eq(dispositivos.huella, datos.huella),
        ),
      )
      .limit(20);
    let creadas = 0;
    for (const otro of otros) {
      const par = [datos.asistenteId, otro.asistenteId].sort();
      const creada = await this.raiseAlerta(tx, organizacionId, {
        eventoId: datos.eventoId,
        tipo: 'A1',
        asistenteId: datos.asistenteId,
        dispositivoId: datos.dispositivoId,
        datos: { otroAsistenteId: otro.asistenteId, otroDispositivoId: otro.dispositivoId },
        clave: `A1:${par.join(':')}`,
      });
      if (creada) creadas++;
    }
    return creadas;
  }
}
