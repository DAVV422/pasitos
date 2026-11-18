import { and, eq, lt } from 'drizzle-orm';
import { alertas, outbox, type Db } from '@pasitos/db';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../comun/reloj';

/** Un *No fui yo* sin atender pasa a prioridad alta a los 10 minutos (HU-305 §2). */
export const ESPERA_PRIORIDAD_MS = 10 * 60 * 1000;

/**
 * Trabajo `alertas-diferidas`, cada minuto: sube la prioridad de los avisos *No fui yo* abiertos
 * de más de 10 minutos y avisa en vivo, para que el organizador los vea resaltados.
 */
export class AlertasDiferidasService {
  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  async raisePrioridad(): Promise<number> {
    const limite = new Date(this.reloj.now().getTime() - ESPERA_PRIORIDAD_MS);
    return this.db.transaction(async (tx) => {
      const subidas = await tx
        .update(alertas)
        .set({ prioridad: 'alta' })
        .where(
          and(
            eq(alertas.tipo, 'no_fui_yo'),
            eq(alertas.estado, 'abierta'),
            eq(alertas.prioridad, 'normal'),
            lt(alertas.createdAt, limite),
          ),
        )
        .returning({ id: alertas.id, eventoId: alertas.eventoId });
      if (subidas.length > 0) {
        await tx.insert(outbox).values(
          subidas.map((a) => ({
            id: uuidv7(),
            tipo: 'alerta.actualizada',
            eventoId: a.eventoId,
            payload: {
              eventoId: a.eventoId,
              alertaId: a.id,
              tipo: 'no_fui_yo',
              estado: 'abierta',
              prioridad: 'alta',
            },
          })),
        );
      }
      return subidas.length;
    });
  }
}
