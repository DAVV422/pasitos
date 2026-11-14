import { Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import type { PgBoss } from 'pg-boss';
import type { ContratoService } from '../contrato/contrato.service';
import type { SelladorService } from '../sellador/sellador.service';

/** Colas del trabajador (HU-103 §3). Nombres de trabajos en kebab-case (Backend §1.3). */
export const COLA_TICK = 'tick-sellador';
export const COLA_STELLAR = 'stellar';

export const TRABAJOS_STELLAR = [
  'anchor-lote',
  'deploy-contrato',
  'sync-retos',
  'register-pantallas',
  'close-contrato',
] as const;
export type NombreTrabajoStellar = (typeof TRABAJOS_STELLAR)[number];

export interface TrabajoStellar {
  readonly trabajo: NombreTrabajoStellar;
  readonly eventoId: string;
}

/** Reintentos con espera creciente: 30 s, 1 min, 2 min… hasta 5 min (Contrato §3.3). */
const REINTENTOS = {
  retryLimit: 50,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 300,
} as const;

/** Encola un trabajo de Stellar. El mismo trabajo del mismo evento no se repite mientras espera. */
export function sendTrabajoStellar(boss: PgBoss, trabajo: TrabajoStellar): Promise<string | null> {
  return boss.send(COLA_STELLAR, trabajo, {
    ...REINTENTOS,
    singletonKey: `${trabajo.trabajo}:${trabajo.eventoId}`,
    singletonSeconds: 50,
  });
}

/**
 * Una sola transacción del operador a la vez en todo el sistema (secuencia de la cuenta, Contrato §3.2).
 * Además de la concurrencia 1, un candado de sesión de PostgreSQL: si hubiera dos trabajadores, el segundo no hace nada.
 */
export async function withCandadoOperador<T>(
  pool: Pool,
  trabajo: () => Promise<T>,
): Promise<T | null> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ ok: boolean }>(
      "select pg_try_advisory_lock(hashtext('stellar-operador')) as ok",
    );
    if (!rows[0]?.ok) {
      return null;
    }
    try {
      return await trabajo();
    } finally {
      await cliente.query("select pg_advisory_unlock(hashtext('stellar-operador'))");
    }
  } finally {
    cliente.release();
  }
}

export interface DependenciasColas {
  readonly boss: PgBoss;
  readonly pool: Pool;
  readonly sellador: SelladorService;
  readonly contrato: ContratoService;
}

export async function startColas({
  boss,
  pool,
  sellador,
  contrato,
}: DependenciasColas): Promise<void> {
  const logger = new Logger('Colas');
  await boss.createQueue(COLA_TICK);
  await boss.createQueue(COLA_STELLAR);

  await boss.schedule(COLA_TICK, '* * * * *');
  await boss.work(COLA_TICK, { localConcurrency: 1 }, async () => {
    for (const eventoId of await sellador.listEventosParaSellar()) {
      await sendTrabajoStellar(boss, { trabajo: 'anchor-lote', eventoId });
    }
    await sellador.checkAtrasos();
  });

  await boss.work<TrabajoStellar>(
    COLA_STELLAR,
    { localConcurrency: 1, batchSize: 1 },
    async ([trabajo]) => {
      if (!trabajo) return;
      const { trabajo: nombre, eventoId } = trabajo.data;
      const hecho = await withCandadoOperador(pool, () =>
        runTrabajoStellar(nombre, eventoId, sellador, contrato),
      );
      if (hecho === null) {
        logger.warn(
          { trabajo: nombre, eventoId },
          'Otro trabajador tiene el candado del operador; se omite',
        );
      }
    },
  );
  logger.log('Colas listas: tick-sellador (cada minuto) y stellar (de a una).');
}

export async function runTrabajoStellar(
  nombre: NombreTrabajoStellar,
  eventoId: string,
  sellador: SelladorService,
  contrato: ContratoService,
): Promise<unknown> {
  switch (nombre) {
    case 'anchor-lote':
      return sellador.processEvento(eventoId);
    case 'deploy-contrato':
      return contrato.deployContrato(eventoId);
    case 'sync-retos':
      return contrato.syncRetos(eventoId);
    case 'register-pantallas':
      return contrato.registerPantallas(eventoId);
    case 'close-contrato':
      return contrato.closeContrato(eventoId);
  }
}
