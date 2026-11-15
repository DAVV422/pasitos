import { Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import type { PgBoss } from 'pg-boss';
import type { ContratoService } from '../contrato/contrato.service';
import type { EnviosCorreoService } from '../correos/envios.service';
import type { CostoRedService } from '../costo/costo-red.service';
import type { SelladorService } from '../sellador/sellador.service';

/** Colas del trabajador (HU-103 §3). Nombres de trabajos en kebab-case (Backend §1.3). */
export const COLA_TICK = 'tick-sellador';
export const COLA_STELLAR = 'stellar';
export const COLA_SALDO = 'check-saldo-operador';
export const COLA_CORREOS = 'send-correos';

export const TRABAJOS_STELLAR = [
  'anchor-lote',
  'deploy-contrato',
  'sync-retos',
  'register-pantallas',
  'close-contrato',
  'extend-contrato',
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
export function withCandadoOperador<T>(pool: Pool, trabajo: () => Promise<T>): Promise<T | null> {
  return withCandado(pool, 'stellar-operador', trabajo);
}

/** Candado de sesión de PostgreSQL con nombre: si otro proceso lo tiene, no hace nada (`null`). */
export async function withCandado<T>(
  pool: Pool,
  nombre: string,
  trabajo: () => Promise<T>,
): Promise<T | null> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ ok: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as ok',
      [nombre],
    );
    if (!rows[0]?.ok) {
      return null;
    }
    try {
      return await trabajo();
    } finally {
      await cliente.query('select pg_advisory_unlock(hashtext($1))', [nombre]);
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
  readonly costo: CostoRedService;
  readonly envios: EnviosCorreoService;
}

export async function startColas({
  boss,
  pool,
  sellador,
  contrato,
  costo,
  envios,
}: DependenciasColas): Promise<void> {
  const logger = new Logger('Colas');
  await boss.createQueue(COLA_TICK);
  await boss.createQueue(COLA_STELLAR);
  await boss.createQueue(COLA_SALDO);
  await boss.createQueue(COLA_CORREOS);

  // T-007 §3: cada minuto, hasta llenar el cupo del día.
  await boss.schedule(COLA_CORREOS, '* * * * *');
  await boss.work(COLA_CORREOS, { localConcurrency: 1 }, async () => {
    const vuelta = await withCandado(pool, 'send-correos', () => envios.processCola());
    if (vuelta && vuelta.enviados + vuelta.fallidos + vuelta.reintentos > 0) {
      logger.log(vuelta, 'Correos procesados');
    }
  });

  await boss.schedule(COLA_TICK, '* * * * *');
  await boss.work(COLA_TICK, { localConcurrency: 1 }, async () => {
    for (const eventoId of await sellador.listEventosParaSellar()) {
      await sendTrabajoStellar(boss, { trabajo: 'anchor-lote', eventoId });
    }
    await sellador.checkAtrasos();
    await costo.checkPresupuesto();
  });

  // HU-104 §3. Friendbot no usa la secuencia del operador: no necesita el candado.
  await boss.schedule(COLA_SALDO, '0 * * * *');
  await boss.work(COLA_SALDO, { localConcurrency: 1 }, async () => {
    const estado = await costo.checkSaldoOperador();
    logger.log(
      { dias: Math.floor(estado.dias), fondosPedidos: estado.fondosPedidos },
      'Saldo del operador revisado',
    );
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
  logger.log(
    'Colas listas: tick-sellador y send-correos (cada minuto), stellar (de a una) y check-saldo-operador (cada hora).',
  );
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
    case 'extend-contrato':
      return contrato.extendContrato(eventoId);
  }
}
