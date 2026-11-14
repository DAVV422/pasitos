import type { BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { TransaccionesStellarRepository } from '@pasitos/stellar';
import { FakeStellar } from '@pasitos/stellar/pruebas';
import type { AlertaOperacion, AlertasOperacionPort } from '../comun/alertas-operacion';
import type { Reloj } from '../comun/reloj';
import { ContratoService } from '../contrato/contrato.service';
import { CostoRedService } from '../costo/costo-red.service';
import { SelladorRepository } from '../sellador/sellador.repository';
import { SelladorService } from '../sellador/sellador.service';

/** Reloj virtual: `sleep` adelanta el tiempo sin esperar. Empieza 10 s adelante para pasar la antigüedad mínima. */
export function createReloj(): Reloj & { adelantar(ms: number): void } {
  let desfase = 10_000;
  return {
    now: () => new Date(Date.now() + desfase),
    sleep: async (ms) => {
      desfase += ms;
    },
    adelantar: (ms) => {
      desfase += ms;
    },
  };
}

export class AlertasEnMemoria implements AlertasOperacionPort {
  readonly recibidas: AlertaOperacion[] = [];
  async raise(alerta: AlertaOperacion): Promise<void> {
    this.recibidas.push(alerta);
  }
  codigos(): string[] {
    return this.recibidas.map((alerta) => alerta.codigo);
  }
}

export interface OpcionesEntorno {
  readonly loteMax?: number;
  readonly comisionMaxStroops?: bigint;
  readonly comisionMaxPreparacionStroops?: bigint;
  readonly presupuestoMensualStroops?: bigint;
}

/** Las piezas del trabajador con PostgreSQL de verdad, Stellar falso y reloj virtual. */
export function createEntorno(base: BaseDePrueba, opciones: OpcionesEntorno = {}) {
  const stellar = new FakeStellar();
  const reloj = createReloj();
  stellar.ahora = () => reloj.now();
  const alertas = new AlertasEnMemoria();
  const repositorio = new SelladorRepository(base.sistema.db);
  const transacciones = new TransaccionesStellarRepository(base.sistema.db, stellar.red);
  const comisionMaxStroops = opciones.comisionMaxStroops ?? 1_000_000n;
  const crearSellador = () =>
    new SelladorService(repositorio, stellar, transacciones, alertas, reloj, {
      intervaloPorDefectoMin: 5,
      loteMax: opciones.loteMax ?? 1000,
      esperaConfirmacionMs: 10_000,
      consultaCadaMs: 1_000,
      margenVencimientoMs: 30_000,
      antiguedadMinimaMs: 2_000,
      comisionMaxStroops,
    });
  const sellador = crearSellador();
  const contrato = new ContratoService(
    repositorio,
    stellar,
    transacciones,
    sellador,
    alertas,
    reloj,
    {
      margenVencimientoMs: 30_000,
      consultaCadaMs: 1_000,
      comisionMaxPreparacionStroops: opciones.comisionMaxPreparacionStroops ?? 10_000_000n,
    },
  );
  const costo = new CostoRedService(transacciones, stellar, alertas, reloj, {
    presupuestoMensualStroops: opciones.presupuestoMensualStroops,
    comisionMaxStroops,
  });
  return {
    stellar,
    reloj,
    alertas,
    repositorio,
    transacciones,
    sellador,
    contrato,
    costo,
    crearSellador,
  };
}

export async function createEventoConContrato(
  base: BaseDePrueba,
  contrato: ContratoService,
  asistentes = 10,
) {
  const { eventoId } = await seedMovimientosPrueba(base.sistema.db, { asistentes, minutos: 0 });
  const contratoId = await contrato.deployContrato(eventoId);
  return { eventoId, contratoId };
}
