import { and, count, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { alertas, escaneos, eventos, outbox, qrEmitidos, type Db } from '@pasitos/db';
import { getVentana, isA6, UMBRALES_ALERTAS } from '@pasitos/dominio';
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

  /**
   * A6 (HU-318 §1): en una pantalla, más de 10 escaneos `vencido` en el minuto siguiente a cada uno
   * de los últimos 3 cambios de QR: una foto del QR circula. Una alerta por pantalla cada 10 min.
   */
  async raiseA6(): Promise<number> {
    const ahora = this.reloj.now();
    const hastaInicio = new Date(ahora.getTime() - UMBRALES_ALERTAS.a6VentanaMs);
    const desde = new Date(ahora.getTime() - 15 * 60 * 1000);
    const recientes = await this.db
      .select({
        pantallaId: qrEmitidos.pantallaId,
        eventoId: qrEmitidos.eventoId,
        organizacionId: qrEmitidos.organizacionId,
        inicioAt: qrEmitidos.inicioAt,
      })
      .from(qrEmitidos)
      .innerJoin(eventos, eq(eventos.id, qrEmitidos.eventoId))
      .where(
        and(
          inArray(eventos.estado, ['en_curso', 'pausado']),
          gte(qrEmitidos.inicioAt, desde),
          lte(qrEmitidos.inicioAt, hastaInicio),
        ),
      )
      .orderBy(desc(qrEmitidos.inicioAt));
    const porPantalla = new Map<string, typeof recientes>();
    for (const fila of recientes) {
      const lista = porPantalla.get(fila.pantallaId) ?? [];
      if (lista.length < UMBRALES_ALERTAS.a6Cambios) lista.push(fila);
      porPantalla.set(fila.pantallaId, lista);
    }
    let creadas = 0;
    for (const [pantallaId, cambios] of porPantalla) {
      const vencidos: number[] = [];
      for (const cambio of cambios) {
        const [fila] = await this.db
          .select({ total: count() })
          .from(escaneos)
          .where(
            and(
              eq(escaneos.pantallaId, pantallaId),
              eq(escaneos.resultado, 'vencido'),
              gte(escaneos.createdAt, cambio.inicioAt),
              lt(
                escaneos.createdAt,
                new Date(cambio.inicioAt.getTime() + UMBRALES_ALERTAS.a6VentanaMs),
              ),
            ),
          );
        vencidos.push(fila?.total ?? 0);
      }
      const primero = cambios[0];
      if (!primero || !isA6(vencidos)) continue;
      const id = uuidv7();
      const [nueva] = await this.db
        .insert(alertas)
        .values({
          id,
          organizacionId: primero.organizacionId,
          eventoId: primero.eventoId,
          tipo: 'A6',
          datos: { pantallaId, vencidos },
          clave: `A6:${pantallaId}:${getVentana(ahora, 10 * 60 * 1000)}`,
        })
        .onConflictDoNothing({ target: [alertas.eventoId, alertas.clave] })
        .returning({ id: alertas.id });
      if (!nueva) continue;
      await this.db.insert(outbox).values({
        id: uuidv7(),
        tipo: 'alerta.creada',
        eventoId: primero.eventoId,
        payload: { eventoId: primero.eventoId, alertaId: id, tipo: 'A6', prioridad: 'normal' },
      });
      creadas++;
    }
    return creadas;
  }
}
