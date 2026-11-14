import { eq, sql } from 'drizzle-orm';
import {
  AppError,
  INTERVALOS_ANCLAJE_MIN,
  isIntervaloAnclaje,
  type IntervaloAnclajeMin,
} from '@pasitos/dominio';
import { bitacora, eventos, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';

/** Quién actúa desde la consola de plataforma. Con HU-201 es la persona con sesión; antes, un comando. */
export interface ActorPlataforma {
  readonly tipo: 'usuario' | 'sistema';
  readonly id: string | null;
  readonly nombre: string;
  readonly rol: string | null;
}

/**
 * Acciones de Pasitos sobre los eventos de cualquier organización (consola de plataforma).
 * Usa la conexión de pasitos_sistema: la consola actúa sobre todas las organizaciones.
 * HU-202 la expone en PATCH /plataforma/eventos/:id; hasta entonces la usa `pnpm plataforma`.
 */
export class EventosPlataformaService {
  constructor(private readonly db: Db) {}

  /**
   * Cambia cada cuánto se ancla un evento (HU-105 §1). `null` vuelve al valor de la plataforma
   * (ANCLAJE_INTERVALO_MIN). Vale desde el ciclo siguiente: tick-sellador lo lee cada minuto.
   */
  async updateIntervaloAnclaje(
    eventoId: string,
    minutos: IntervaloAnclajeMin | null,
    actor: ActorPlataforma,
    motivo?: string,
  ): Promise<void> {
    if (minutos !== null && !isIntervaloAnclaje(minutos)) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'intervaloAnclajeMin',
            code: 'VALOR_NO_PERMITIDO',
            message: `Valores permitidos: ${INTERVALOS_ANCLAJE_MIN.join(', ')} o vacío.`,
          },
        ],
      });
    }
    await this.db.transaction(async (tx) => {
      const [evento] = await tx
        .select({
          id: eventos.id,
          organizacionId: eventos.organizacionId,
          nombre: eventos.nombre,
          intervaloAnclajeMin: eventos.intervaloAnclajeMin,
        })
        .from(eventos)
        .where(eq(eventos.id, eventoId))
        .for('update');
      if (!evento) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (evento.intervaloAnclajeMin === minutos) {
        return;
      }
      await tx
        .update(eventos)
        .set({ intervaloAnclajeMin: minutos, updatedAt: sql`now()` })
        .where(eq(eventos.id, eventoId));
      await tx.insert(bitacora).values({
        id: uuidv7(),
        organizacionId: evento.organizacionId,
        eventoId,
        actorTipo: actor.tipo,
        actorId: actor.id,
        actorNombre: actor.nombre,
        actorRol: actor.rol,
        accion: 'evento.intervalo_anclaje.update',
        objetoTipo: 'evento',
        objetoId: eventoId,
        objetoNombre: evento.nombre,
        antes: { intervaloAnclajeMin: evento.intervaloAnclajeMin },
        despues: { intervaloAnclajeMin: minutos, ...(motivo ? { motivo } : {}) },
      });
    });
  }
}
