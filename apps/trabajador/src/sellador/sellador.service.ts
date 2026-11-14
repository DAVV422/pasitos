import { Logger } from '@nestjs/common';
import { buildEventoIdHash, buildGenesis, equalBytes, toHex } from '@pasitos/firmas';
import {
  ErrorContratoStellar,
  StellarNoDisponible,
  type ResultadoTx,
  type StellarPort,
} from '@pasitos/stellar';
import { uuidv7 } from 'uuidv7';
import type { AlertasOperacionPort } from '../comun/alertas-operacion';
import type { Reloj } from '../comun/reloj';
import { buildContenidoLote } from './contenido-lote';
import type { FilaLote, SelladorRepository } from './sellador.repository';

export interface OpcionesSellador {
  readonly intervaloPorDefectoMin: number;
  readonly loteMax: number;
  /** Cuánto se espera la confirmación dentro de una ejecución antes de dejarla para la siguiente. */
  readonly esperaConfirmacionMs: number;
  readonly consultaCadaMs: number;
  /** Margen sobre la validez de 60 s antes de dar por vencida una transacción que no apareció. */
  readonly margenVencimientoMs: number;
  /** Un movimiento entra en un lote recién cuando tiene esta antigüedad (Contrato §3.1). */
  readonly antiguedadMinimaMs: number;
}

export const OPCIONES_SELLADOR_POR_DEFECTO: Omit<
  OpcionesSellador,
  'intervaloPorDefectoMin' | 'loteMax'
> = {
  esperaConfirmacionMs: 60_000,
  consultaCadaMs: 2_000,
  margenVencimientoMs: 30_000,
  antiguedadMinimaMs: 2_000,
};

/** Cómo terminó una ejecución del sellador para un evento. */
export type ResultadoSellado =
  | 'al_dia' // Todo lo armado está anclado.
  | 'pendiente' // Hay un lote enviado esperando confirmación.
  | 'detenido'; // Hay un lote rechazado: el sellado del evento está detenido.

const VALIDEZ_TX_MS = 60_000;
const MAX_PASOS = 50;
const ATRASO_MS = 15 * 60 * 1000;
const SIN_RESPUESTA_MS = 5 * 60 * 1000;

/**
 * Sellador (HU-103 §4): arma un lote por evento con todos sus movimientos nuevos y lo ancla en orden.
 * Cada paso deja el lote en un estado y cada ejecución empieza mirando el estado: un reinicio retoma.
 */
export class SelladorService {
  private readonly logger = new Logger('Sellador');
  private primerFalloRpcAt: Date | null = null;

  constructor(
    private readonly repositorio: SelladorRepository,
    private readonly stellar: StellarPort,
    private readonly alertas: AlertasOperacionPort,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesSellador,
  ) {}

  /** Eventos que el tick revisa en cada minuto. */
  async listEventosParaSellar(): Promise<string[]> {
    const eventos = await this.repositorio.listEventosParaSellar(
      this.opciones.intervaloPorDefectoMin,
    );
    return eventos.map((evento) => evento.id);
  }

  /**
   * Una ejecución para un evento. Con `forzar` no espera el intervalo; con `cierre` tampoco
   * espera la antigüedad mínima de los movimientos (Contrato §3.1.2: al cerrar se ancla en el momento).
   */
  async processEvento(
    eventoId: string,
    opciones: { forzar?: boolean; cierre?: boolean } = {},
  ): Promise<ResultadoSellado> {
    try {
      const resultado = await this.processEventoSinRegistrar(eventoId, opciones);
      this.primerFalloRpcAt = null;
      return resultado;
    } catch (error) {
      if (error instanceof StellarNoDisponible) {
        this.primerFalloRpcAt ??= this.reloj.now();
        this.logger.warn({ eventoId, error: error.message }, 'Stellar no respondió; se reintenta');
      }
      throw error;
    }
  }

  private async processEventoSinRegistrar(
    eventoId: string,
    opciones: { forzar?: boolean; cierre?: boolean },
  ): Promise<ResultadoSellado> {
    const evento = await this.repositorio.getEvento(eventoId);
    if (!evento?.contratoId) {
      throw new Error(`El evento ${eventoId} no tiene contrato`);
    }
    if (
      (await this.repositorio.listLotesPendientes(eventoId)).some((l) => l.estado === 'rechazado')
    ) {
      return 'detenido';
    }

    // 1. Armar no depende de Stellar: con la red caída, los lotes se siguen armando (V11).
    if (opciones.forzar === true || (await this.isIntervaloCumplido(eventoId))) {
      for (let paso = 0; paso < MAX_PASOS; paso++) {
        const armado = await this.armLote(eventoId, opciones.cierre === true);
        // Si el lote llegó al máximo quedan movimientos: se arma otro enseguida.
        if (!armado || (armado.cantidad < this.opciones.loteMax && opciones.cierre !== true)) break;
      }
    }

    // 2. Enviar y confirmar, siempre en orden de número.
    for (let paso = 0; paso < MAX_PASOS; paso++) {
      const pendientes = await this.repositorio.listLotesPendientes(eventoId);
      const lote = pendientes[0];
      if (!lote) {
        return 'al_dia';
      }
      if (lote.estado === 'rechazado') {
        return 'detenido';
      }
      if (lote.estado === 'enviado') {
        if ((await this.confirmLote(lote)) === 'pendiente') return 'pendiente';
        continue;
      }
      await this.sendLote(lote, evento.contratoId);
    }
    return 'pendiente';
  }

  private async isIntervaloCumplido(eventoId: string): Promise<boolean> {
    const [evento] = (
      await this.repositorio.listEventosParaSellar(this.opciones.intervaloPorDefectoMin)
    ).filter((e) => e.id === eventoId);
    if (!evento?.ultimoArmadoAt) {
      return true;
    }
    return (
      this.reloj.now().getTime() - evento.ultimoArmadoAt.getTime() >= evento.intervaloMin * 60_000
    );
  }

  /** 4.1 Armar: un lote con los movimientos sin lote, en una transacción. Devuelve null si no hay. */
  async armLote(
    eventoId: string,
    cierre = false,
  ): Promise<{ lote: FilaLote; cantidad: number } | null> {
    const evento = await this.repositorio.getEvento(eventoId);
    if (!evento) {
      throw new Error(`Evento inexistente: ${eventoId}`);
    }
    const ahora = this.reloj.now();
    const hasta = cierre ? ahora : new Date(ahora.getTime() - this.opciones.antiguedadMinimaMs);
    const eventoIdHash = await buildEventoIdHash(eventoId);

    return this.repositorio.transaction(async (tx) => {
      await this.repositorio.lockArmado(tx, eventoId);
      const movimientos = await this.repositorio.listMovimientosSinLote(
        tx,
        eventoId,
        hasta,
        this.opciones.loteMax,
      );
      if (movimientos.length === 0) {
        return null;
      }
      const ultimoN = await this.repositorio.getUltimoN(tx, eventoId);
      const anterior = await this.repositorio.getUltimoLote(tx, eventoId);
      const huellaAnterior = anterior
        ? new Uint8Array(anterior.huella)
        : await buildGenesis(eventoIdHash);
      const numero = (anterior?.numero ?? 0) + 1;
      const conN = movimientos.map((m, i) => ({ ...m, n: ultimoN + i + 1 }));
      const contenido = await buildContenidoLote({
        eventoIdHash,
        numero,
        huellaAnterior,
        movimientos: conN,
        autores: await this.repositorio.listAutores(tx, eventoId),
      });

      const lote = await this.repositorio.insertLote(tx, {
        id: uuidv7(),
        organizacionId: evento.organizacionId,
        eventoId,
        numero,
        huellaAnterior: Buffer.from(huellaAnterior),
        raiz: Buffer.from(contenido.raiz),
        huella: Buffer.from(contenido.huella),
        cantidadMovimientos: conN.length,
        conteosPorReto: contenido.conteos,
        estado: 'armado',
        armadoAt: ahora,
      });
      await this.repositorio.insertMovimientosLote(
        tx,
        conN.map((m) => ({
          movimientoId: m.id,
          organizacionId: evento.organizacionId,
          eventoId,
          loteId: lote.id,
          n: m.n,
        })),
      );
      this.logger.log({ eventoId, lote: numero, movimientos: conN.length }, 'Lote armado');
      return { lote, cantidad: conN.length };
    });
  }

  /** 4.2 y 4.3: simular, firmar, guardar el tx_hash y enviar. */
  private async sendLote(lote: FilaLote, contratoId: string): Promise<void> {
    let tx;
    try {
      tx = await this.stellar.prepare({
        operacion: 'anchor',
        contratoId,
        n: lote.numero,
        huellaAnterior: lote.huellaAnterior,
        raiz: lote.raiz,
        conteos: lote.conteosPorReto as [number, number][],
      });
    } catch (error) {
      if (error instanceof ErrorContratoStellar) {
        if (error.nombre === 'LoteYaAnclado') {
          await this.resolveYaAnclado(lote, contratoId);
        } else {
          await this.rejectLote(lote, error.nombre);
        }
        return;
      }
      throw error;
    }

    await this.repositorio.updateLote(lote.id, {
      estado: 'enviado',
      txHash: tx.hash,
      comisionEstimadaStroops: tx.comisionEstimadaStroops,
      intentos: lote.intentos + 1,
      enviadoAt: this.reloj.now(),
      ultimoError: null,
    });
    try {
      await this.stellar.send(tx);
    } catch (error) {
      if (!(error instanceof StellarNoDisponible)) {
        throw error;
      }
      // El tx_hash ya está guardado: la confirmación dirá si entró.
      this.logger.warn(
        { lote: lote.numero, error: error.message },
        'Sin respuesta al enviar el lote',
      );
    }
  }

  /** 4.4 Confirmar: consulta el tx_hash hasta que la transacción entre, falle o venza. */
  private async confirmLote(
    lote: FilaLote,
  ): Promise<'confirmado' | 'reintentar' | 'pendiente' | 'rechazado'> {
    if (!lote.txHash || !lote.enviadoAt) {
      await this.repositorio.updateLote(lote.id, { estado: 'armado' });
      return 'reintentar';
    }
    const limite = this.reloj.now().getTime() + this.opciones.esperaConfirmacionMs;
    const vence = lote.enviadoAt.getTime() + VALIDEZ_TX_MS + this.opciones.margenVencimientoMs;

    for (;;) {
      const resultado = await this.stellar.getResultado(lote.txHash);
      if (resultado.estado === 'incluida') {
        if (!(resultado.valor instanceof Uint8Array) || !equalBytes(resultado.valor, lote.huella)) {
          await this.rejectLote(lote, 'HuellaDelContratoDistinta');
          return 'rechazado';
        }
        await this.markConfirmado(lote, resultado);
        return 'confirmado';
      }
      if (resultado.estado === 'fallida') {
        // La simulación del próximo intento dirá si fue un rechazo del contrato.
        await this.repositorio.updateLote(lote.id, {
          estado: 'armado',
          ultimoError: 'Transacción fallida',
        });
        return 'reintentar';
      }
      const ahora = this.reloj.now().getTime();
      if (ahora > vence) {
        await this.repositorio.updateLote(lote.id, {
          estado: 'armado',
          ultimoError: 'Venció sin entrar',
        });
        return 'reintentar';
      }
      if (ahora >= limite) {
        return 'pendiente';
      }
      await this.reloj.sleep(this.opciones.consultaCadaMs);
    }
  }

  /** `LoteYaAnclado`: entró en un intento anterior si el contrato tiene esta misma huella. */
  private async resolveYaAnclado(lote: FilaLote, contratoId: string): Promise<void> {
    const ultimo = await this.stellar.getUltimo(contratoId);
    if (ultimo.n !== lote.numero || !equalBytes(ultimo.huella, lote.huella)) {
      await this.rejectLote(lote, 'LoteYaAncladoConOtraHuella');
      return;
    }
    const anterior = lote.txHash ? await this.stellar.getResultado(lote.txHash) : null;
    await this.markConfirmado(lote, anterior?.estado === 'incluida' ? anterior : null);
  }

  private async markConfirmado(
    lote: FilaLote,
    resultado: Extract<ResultadoTx, { estado: 'incluida' }> | null,
  ): Promise<void> {
    await this.repositorio.updateLote(lote.id, {
      estado: 'confirmado',
      ledgerStellar: resultado?.ledger ?? null,
      comisionStroops: resultado?.comisionStroops ?? null,
      confirmadoAt: this.reloj.now(),
      ultimoError: null,
    });
    const rango = await this.repositorio.getRangoN(lote.id);
    await this.repositorio.insertOutbox({
      tipo: 'lote.anclado',
      eventoId: lote.eventoId,
      payload: {
        eventoId: lote.eventoId,
        loteId: lote.id,
        numero: lote.numero,
        desdeN: rango.desde,
        hastaN: rango.hasta,
      },
    });
    this.logger.log(
      { eventoId: lote.eventoId, lote: lote.numero, ledger: resultado?.ledger },
      'Lote anclado',
    );
  }

  /** §5: un lote rechazado detiene el sellado del evento y avisa. No se reintenta. */
  private async rejectLote(lote: FilaLote, motivo: string): Promise<void> {
    await this.repositorio.updateLote(lote.id, { estado: 'rechazado', ultimoError: motivo });
    await this.alertas.raise({
      codigo: 'LOTE_RECHAZADO',
      gravedad: 'critica',
      eventoId: lote.eventoId,
      detalle: { lote: lote.numero, motivo },
    });
  }

  /**
   * §5: rearma un lote rechazado con los mismos movimientos (después de corregir el error del servidor)
   * y lo deja listo para enviar. Queda en la bitácora de plataforma.
   */
  async rearmLote(eventoId: string, numero: number, motivo: string): Promise<void> {
    const lote = await this.repositorio.getLote(eventoId, numero);
    if (lote?.estado !== 'rechazado') {
      throw new Error(`El lote ${numero} no está rechazado`);
    }
    const evento = await this.repositorio.getEvento(eventoId);
    const eventoIdHash = await buildEventoIdHash(eventoId);
    // Este lote y los que se armaron después: cambia su huella, así que cambia la cadena que sigue.
    const aRearmar = (await this.repositorio.listLotesPendientes(eventoId)).filter(
      (l) => l.numero >= numero,
    );
    let huellaAnterior: Uint8Array = new Uint8Array(lote.huellaAnterior);
    let nueva: Uint8Array | null = null;
    for (const actual of aRearmar) {
      const contenido = await this.repositorio.transaction(async (tx) => {
        await this.repositorio.lockArmado(tx, eventoId);
        return buildContenidoLote({
          eventoIdHash,
          numero: actual.numero,
          huellaAnterior,
          movimientos: await this.repositorio.listMovimientosDeLote(tx, actual.id),
          autores: await this.repositorio.listAutores(tx, eventoId),
        });
      });
      await this.repositorio.updateLote(actual.id, {
        huellaAnterior: Buffer.from(huellaAnterior),
        raiz: Buffer.from(contenido.raiz),
        huella: Buffer.from(contenido.huella),
        conteosPorReto: contenido.conteos,
        estado: 'armado',
        txHash: null,
        ultimoError: null,
      });
      nueva ??= contenido.huella;
      huellaAnterior = contenido.huella;
    }
    await this.repositorio.insertBitacora({
      organizacionId: evento?.organizacionId ?? null,
      eventoId,
      actorTipo: 'sistema',
      actorNombre: 'Soporte de Pasitos (comando)',
      accion: 'lote.rearmar',
      objetoTipo: 'lote',
      objetoId: lote.id,
      objetoNombre: `Lote ${numero}`,
      antes: { huella: toHex(lote.huella), error: lote.ultimoError },
      despues: { huella: nueva ? toHex(nueva) : null, motivo, lotesRearmados: aRearmar.length },
    });
  }

  /** Alertas de atraso y de Stellar sin respuesta (HU-103 §7). Las revisa el tick. */
  async checkAtrasos(): Promise<void> {
    const ahora = this.reloj.now();
    const atrasados = await this.repositorio.listLotesAtrasados(
      new Date(ahora.getTime() - ATRASO_MS),
    );
    for (const lote of atrasados) {
      await this.alertas.raise({
        codigo: 'ANCLAJE_ATRASADO',
        gravedad: 'aviso',
        eventoId: lote.eventoId,
        detalle: { lote: lote.numero, estado: lote.estado },
      });
    }
    if (
      this.primerFalloRpcAt &&
      ahora.getTime() - this.primerFalloRpcAt.getTime() > SIN_RESPUESTA_MS
    ) {
      await this.alertas.raise({
        codigo: 'STELLAR_SIN_RESPUESTA',
        gravedad: 'aviso',
        detalle: { desde: this.primerFalloRpcAt.toISOString() },
      });
    }
  }
}
