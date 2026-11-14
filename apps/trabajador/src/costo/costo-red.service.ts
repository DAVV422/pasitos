import { Logger } from '@nestjs/common';
import { formatMes, type StellarPort, type TransaccionesStellarRepository } from '@pasitos/stellar';
import type { AlertasOperacionPort } from '../comun/alertas-operacion';
import type { Reloj } from '../comun/reloj';

export interface OpcionesCostoRed {
  /** Sin presupuesto no hay alerta de presupuesto. */
  readonly presupuestoMensualStroops?: bigint | undefined;
  /** Si todavía no se ancló nada, el costo de un anchor se supone igual al tope. */
  readonly comisionMaxStroops: bigint;
}

export interface EstadoSaldo {
  readonly saldoStroops: bigint;
  readonly gastoDiarioStroops: bigint;
  readonly dias: number;
  readonly fondosPedidos: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_PROMEDIO = 7n;
/** Mínimo de gasto diario: 12 anchor por hora durante 8 horas (HU-104 §3). */
const ANCHOR_MINIMOS_POR_DIA = 12n * 8n;
const DIAS_ALERTA = 30;
/** Debajo de 1 000 XLM se pide más a Friendbot. 1 XLM = 10 000 000 stroops. */
const SALDO_MINIMO_STROOPS = 1_000n * 10_000_000n;

/** Presupuesto mensual y saldo del operador (HU-104 §3). Avisan; nunca detienen el sellador. */
export class CostoRedService {
  private readonly logger = new Logger('CostoRed');
  /** Alertas de presupuesto ya lanzadas, por mes y nivel: una sola vez cada una. */
  private readonly avisados = new Set<string>();

  constructor(
    private readonly transacciones: TransaccionesStellarRepository,
    private readonly stellar: StellarPort,
    private readonly alertas: AlertasOperacionPort,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesCostoRed,
  ) {}

  /** Lo revisa el tick cada minuto: una suma sobre el mes en curso. */
  async checkPresupuesto(): Promise<void> {
    const presupuesto = this.opciones.presupuestoMensualStroops;
    if (!presupuesto) {
      return;
    }
    const mes = formatMes(this.reloj.now());
    const { comisionStroops } = await this.transacciones.getCostoRed({ mes });
    const detalle = {
      mes,
      gastoStroops: comisionStroops.toString(),
      presupuestoStroops: presupuesto.toString(),
    };
    if (comisionStroops >= presupuesto) {
      await this.raiseUnaVez(`${mes}:100`, () =>
        this.alertas.raise({ codigo: 'PRESUPUESTO_RED_100', gravedad: 'critica', detalle }),
      );
    } else if (comisionStroops * 10n >= presupuesto * 8n) {
      await this.raiseUnaVez(`${mes}:80`, () =>
        this.alertas.raise({ codigo: 'PRESUPUESTO_RED_80', gravedad: 'aviso', detalle }),
      );
    }
  }

  /** Trabajo `check-saldo-operador`, cada hora. */
  async checkSaldoOperador(): Promise<EstadoSaldo> {
    const ahora = this.reloj.now();
    let saldo = await this.stellar.getSaldoOperador();
    const gasto = await this.transacciones.getGastoDesde(
      new Date(ahora.getTime() - Number(DIAS_PROMEDIO) * DIA_MS),
    );
    const costoAnchor = gasto.promedioAnchor ?? this.opciones.comisionMaxStroops;
    const minimo = ANCHOR_MINIMOS_POR_DIA * costoAnchor;
    const promedio = gasto.total / DIAS_PROMEDIO;
    const gastoDiario = promedio > minimo ? promedio : minimo;

    // D50: el piloto corre en testnet (o en la red local), las dos con Friendbot.
    let fondosPedidos = false;
    if (saldo < SALDO_MINIMO_STROOPS) {
      try {
        await this.stellar.requestFondos();
        fondosPedidos = true;
        saldo = await this.stellar.getSaldoOperador();
        this.logger.log({ saldoStroops: saldo.toString() }, 'Friendbot recargó al operador');
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Friendbot no respondió',
        );
      }
    }

    const dias = gastoDiario > 0n ? Number(saldo) / Number(gastoDiario) : Number.POSITIVE_INFINITY;
    if (dias < DIAS_ALERTA) {
      await this.alertas.raise({
        codigo: 'SALDO_OPERADOR_BAJO',
        gravedad: 'aviso',
        detalle: {
          dias: Math.floor(dias),
          saldoStroops: saldo.toString(),
          gastoDiarioStroops: gastoDiario.toString(),
        },
      });
    }
    return { saldoStroops: saldo, gastoDiarioStroops: gastoDiario, dias, fondosPedidos };
  }

  private async raiseUnaVez(clave: string, lanzar: () => Promise<void>): Promise<void> {
    if (this.avisados.has(clave)) {
      return;
    }
    this.avisados.add(clave);
    await lanzar();
  }
}
