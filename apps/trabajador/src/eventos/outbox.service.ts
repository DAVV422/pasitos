import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { bitacora, eventos, idempotencia, outbox, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';
import type { NombreTrabajoStellar, TrabajoStellar } from '../colas/colas';
import type { AlertasOperacionPort } from '../comun/alertas-operacion';
import type { Reloj } from '../comun/reloj';

/** Qué trabajo de Stellar sale de cada aviso de `outbox` (HU-205 §4). */
export const TRABAJO_POR_OUTBOX: Readonly<Record<string, NombreTrabajoStellar>> = {
  'evento.publicado': 'deploy-contrato',
  'reto.cambiado': 'sync-retos',
  'pantalla.conectada': 'register-pantallas',
  // HU-401: al cerrar, el último lote y el cierre del contrato.
  'evento.cerrado': 'close-contrato',
};

export type EncolarTrabajo = (trabajo: TrabajoStellar) => Promise<unknown>;

/**
 * Del panel a Stellar (HU-205 §4): el API escribe en `outbox` en la misma transacción que la
 * acción; aquí se encola el trabajo de Stellar y se marca `procesado_at`. Si encolar falla, la
 * fila queda sin marcar y se reintenta en la vuelta siguiente. Los tipos que no conoce (avisos en
 * vivo, fase 3) los deja para el procesador de SSE.
 */
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly db: Db,
    private readonly encolar: EncolarTrabajo,
  ) {}

  /**
   * Los avisos que son solo de los canales en vivo (no los procesa este trabajador) se borran a las
   * 24 h (T-301 §4). Los de Stellar quedan, con su `procesado_at`.
   */
  async purgeAvisos(): Promise<number> {
    const borrados = await this.db
      .delete(outbox)
      .where(
        and(
          isNull(outbox.procesadoAt),
          notInArray(outbox.tipo, Object.keys(TRABAJO_POR_OUTBOX)),
          sql`${outbox.createdAt} < now() - interval '24 hours'`,
        ),
      )
      .returning({ id: outbox.id });
    return borrados.length;
  }

  /** Las respuestas guardadas por `Idempotency-Key` se borran a las 24 h (HU-306 §1). */
  async purgeIdempotencia(): Promise<number> {
    const borradas = await this.db
      .delete(idempotencia)
      .where(sql`${idempotencia.createdAt} < now() - interval '24 hours'`)
      .returning({ clave: idempotencia.clave });
    return borradas.length;
  }

  async processOutbox(limite = 20): Promise<{ procesadas: number; fallidas: number }> {
    const resultado = { procesadas: 0, fallidas: 0 };
    for (let i = 0; i < limite; i++) {
      const hecho = await this.db.transaction(async (tx) => {
        const [fila] = await tx
          .select()
          .from(outbox)
          .where(
            and(isNull(outbox.procesadoAt), inArray(outbox.tipo, Object.keys(TRABAJO_POR_OUTBOX))),
          )
          .orderBy(asc(outbox.createdAt))
          .limit(1)
          .for('update', { skipLocked: true });
        if (!fila) {
          return null;
        }
        const trabajo = TRABAJO_POR_OUTBOX[fila.tipo];
        if (!trabajo || !fila.eventoId) {
          await tx
            .update(outbox)
            .set({ procesadoAt: sql`now()` })
            .where(eq(outbox.id, fila.id));
          return true;
        }
        try {
          await this.encolar({ trabajo, eventoId: fila.eventoId });
        } catch (error) {
          this.logger.warn(
            { outboxId: fila.id, err: error instanceof Error ? error.message : String(error) },
            'No se pudo encolar el trabajo de Stellar; se reintenta',
          );
          return false;
        }
        await tx
          .update(outbox)
          .set({ procesadoAt: sql`now()` })
          .where(eq(outbox.id, fila.id));
        return true;
      });
      if (hecho === null) {
        break;
      }
      if (hecho) {
        resultado.procesadas += 1;
      } else {
        resultado.fallidas += 1;
        // La que falló sigue primera en la fila: no insistir en esta vuelta.
        break;
      }
    }
    return resultado;
  }
}

/** Cuánto se espera el contrato a la hora de inicio antes de avisar (HU-205 §3). */
const ESPERA_CONTRATO_MS = 5 * 60 * 1000;

/**
 * Trabajo `open-eventos` (HU-205 §3), cada minuto: los publicados con `inicio_at <= ahora` y el
 * contrato creado pasan a `en_curso`, con bitácora de *Pasitos (automático)*. Sin contrato a los 5
 * minutos de la hora de inicio, alerta `EVENTO_SIN_CONTRATO_A_TIEMPO`.
 */
export class AperturaEventosService {
  constructor(
    private readonly db: Db,
    private readonly alertas: AlertasOperacionPort,
    private readonly reloj: Reloj,
  ) {}

  async openEventos(): Promise<{ abiertos: string[]; sinContrato: string[] }> {
    const ahora = this.reloj.now();
    const listos = await this.db
      .select({
        id: eventos.id,
        organizacionId: eventos.organizacionId,
        nombre: eventos.nombre,
        inicioAt: eventos.inicioAt,
        contratoId: eventos.contratoId,
      })
      .from(eventos)
      .where(and(eq(eventos.estado, 'publicado'), sql`${eventos.inicioAt} <= ${ahora}`));
    const abiertos: string[] = [];
    const sinContrato: string[] = [];
    for (const evento of listos) {
      if (!evento.contratoId) {
        if (ahora.getTime() - evento.inicioAt.getTime() >= ESPERA_CONTRATO_MS) {
          sinContrato.push(evento.id);
          await this.alertas.raise({
            codigo: 'EVENTO_SIN_CONTRATO_A_TIEMPO',
            gravedad: 'aviso',
            eventoId: evento.id,
            detalle: { inicioAt: evento.inicioAt.toISOString() },
          });
        }
        continue;
      }
      const abierto = await this.db.transaction(async (tx) => {
        const filas = await tx
          .update(eventos)
          .set({ estado: 'en_curso', iniciadoAt: ahora, updatedAt: ahora })
          .where(and(eq(eventos.id, evento.id), eq(eventos.estado, 'publicado')))
          .returning({ id: eventos.id });
        if (filas.length === 0) {
          return false;
        }
        await tx.insert(bitacora).values({
          id: uuidv7(),
          organizacionId: evento.organizacionId,
          eventoId: evento.id,
          actorTipo: 'sistema',
          actorNombre: 'Pasitos (automático)',
          accion: 'evento.open',
          objetoTipo: 'evento',
          objetoId: evento.id,
          objetoNombre: evento.nombre,
          antes: { estado: 'publicado' },
          despues: { estado: 'en_curso' },
        });
        // El aviso en vivo (T-301): la app y el panel pasan a "en curso" sin recargar.
        await tx.insert(outbox).values({
          id: uuidv7(),
          tipo: 'evento.abierto',
          eventoId: evento.id,
          payload: { eventoId: evento.id },
        });
        return true;
      });
      if (abierto) {
        abiertos.push(evento.id);
      }
    }
    return { abiertos, sinContrato };
  }
}
