import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Reloj } from './reloj';

export type CodigoAlertaOperacion =
  | 'LOTE_RECHAZADO'
  | 'ANCLAJE_ATRASADO'
  | 'STELLAR_SIN_RESPUESTA'
  | 'COMISION_SOBRE_TOPE'
  | 'PRESUPUESTO_RED_80'
  | 'PRESUPUESTO_RED_100'
  | 'SALDO_OPERADOR_BAJO'
  | 'EVENTO_SIN_CONTRATO_A_TIEMPO';

export interface AlertaOperacion {
  readonly codigo: CodigoAlertaOperacion;
  readonly gravedad: 'aviso' | 'critica';
  readonly eventoId?: string;
  /** Sin datos personales: ids, números de lote, códigos de error. */
  readonly detalle: Readonly<Record<string, unknown>>;
}

/** Alertas para el equipo de Pasitos (HU-103 §7). El correo llega con T-007; la consola, con HU-202. */
export interface AlertasOperacionPort {
  raise(alerta: AlertaOperacion): Promise<void>;
}

const DEDUPLICAR_MS = 15 * 60 * 1000;

/** Primer adaptador: log (error o warn) y Sentry con la etiqueta `alerta`. No repite la misma en 15 min. */
export class AlertasEnLogs implements AlertasOperacionPort {
  private readonly logger = new Logger('AlertasOperacion');
  private readonly ultimas = new Map<string, number>();

  constructor(private readonly reloj: Reloj) {}

  async raise(alerta: AlertaOperacion): Promise<void> {
    const clave = `${alerta.codigo}:${alerta.eventoId ?? '-'}`;
    const ahora = this.reloj.now().getTime();
    const anterior = this.ultimas.get(clave);
    if (anterior !== undefined && ahora - anterior < DEDUPLICAR_MS) {
      return;
    }
    this.ultimas.set(clave, ahora);
    const mensaje = `Alerta ${alerta.codigo}`;
    const contexto = { alerta: alerta.codigo, eventoId: alerta.eventoId, ...alerta.detalle };
    if (alerta.gravedad === 'critica') {
      this.logger.error(contexto, mensaje);
    } else {
      this.logger.warn(contexto, mensaje);
    }
    Sentry.captureMessage(mensaje, {
      level: alerta.gravedad === 'critica' ? 'error' : 'warning',
      tags: { alerta: alerta.codigo },
      extra: contexto,
    });
  }
}
