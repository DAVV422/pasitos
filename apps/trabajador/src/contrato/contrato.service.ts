import { Logger } from '@nestjs/common';
import { buildEventoIdHash, buildGenesis, concatBytes, encodeUtf8, sha256 } from '@pasitos/firmas';
import {
  StellarNoDisponible,
  type LlamadaContrato,
  type ParNumerico,
  type ResultadoTx,
  type StellarPort,
  type TransaccionesStellarRepository,
} from '@pasitos/stellar';
import type { AlertasOperacionPort } from '../comun/alertas-operacion';
import type { Reloj } from '../comun/reloj';
import type { EvidenciaService } from '../evidencia/evidencia.service';
import type { SelladorRepository } from '../sellador/sellador.repository';
import type { SelladorService } from '../sellador/sellador.service';

type Incluida = Extract<ResultadoTx, { estado: 'incluida' }>;

export interface OpcionesContrato {
  readonly margenVencimientoMs: number;
  readonly consultaCadaMs: number;
  /** HU-104 §2, para deploy, retos, pantallas y TTL. No se aplica al cierre: solo alerta. */
  readonly comisionMaxPreparacionStroops: bigint;
}

/** La simulación pidió más que el tope (HU-104 §2). El trabajo se reintenta más tarde. */
export class ComisionSobreTope extends Error {
  constructor(
    readonly operacion: string,
    readonly comisionStroops: bigint,
  ) {
    super(`La comisión de ${operacion} (${comisionStroops} stroops) supera el tope`);
    this.name = 'ComisionSobreTope';
  }
}

const INTENTOS = 3;
/**
 * D59: los datos de un evento real quedan consultables en la red 6 meses después del cierre.
 * ~180 días de ledgers de 5 s, debajo del máximo de la red (3 110 400).
 */
export const LEDGERS_EN_RED = 3_110_000;
const SEGUNDOS_POR_LEDGER = 5;
const PASOS_CIERRE = 200;

/**
 * Trabajos que tocan el contrato fuera del anclaje (Contrato §3.6, HU-103 §6). Todos idempotentes:
 * comparan con lo que ya está en la red antes de llamar.
 */
export class ContratoService {
  private readonly logger = new Logger('Contrato');

  constructor(
    private readonly repositorio: SelladorRepository,
    private readonly stellar: StellarPort,
    private readonly transacciones: TransaccionesStellarRepository,
    private readonly sellador: SelladorService,
    private readonly alertas: AlertasOperacionPort,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesContrato,
    private readonly evidencia?: EvidenciaService,
  ) {}

  /** La sal de la instancia sale del evento: un reintento calcula la misma dirección y no crea dos. */
  static buildSalt(eventoId: string): Promise<Uint8Array> {
    return sha256(concatBytes(encodeUtf8('pasitos-contrato-v1:'), encodeUtf8(eventoId)));
  }

  async deployContrato(eventoId: string): Promise<string> {
    const evento = await this.getEvento(eventoId);
    if (evento.contratoId) {
      return evento.contratoId;
    }
    const salt = await ContratoService.buildSalt(eventoId);
    const contratoId = this.stellar.computeContratoId(salt);
    const retos = await this.repositorio.listRetosActivos(eventoId);
    if (!(await this.stellar.existsContrato(contratoId))) {
      await this.execute(eventoId, {
        operacion: 'deploy',
        salt,
        evento: {
          idHash: await buildEventoIdHash(eventoId),
          inicio: Math.floor(evento.inicioAt.getTime() / 1000),
          fin: Math.floor(evento.finAt.getTime() / 1000),
        },
        retos: retos.map((r) => [r.numero, r.topeTotal] as const),
      });
    }
    await this.repositorio.setContratoId(eventoId, contratoId);
    await this.repositorio.markRetosRegistrados(
      eventoId,
      retos.map((r) => r.numero),
    );
    this.logger.log({ eventoId, contratoId }, 'Contrato del evento creado');
    await this.registerPantallas(eventoId);
    return contratoId;
  }

  /** Agrega los retos nuevos y sube los topes que subieron. Un tope nunca baja en la red. */
  async syncRetos(eventoId: string): Promise<void> {
    const contratoId = await this.getContratoId(eventoId);
    const retos = await this.repositorio.listRetosActivos(eventoId);
    const nuevos: ParNumerico[] = [];
    const subidas: ParNumerico[] = [];
    for (const reto of retos) {
      const enRed = await this.stellar.getReto(contratoId, reto.numero);
      if (!enRed) {
        nuevos.push([reto.numero, reto.topeTotal]);
      } else if (reto.topeTotal > enRed.tope) {
        subidas.push([reto.numero, reto.topeTotal]);
      } else if (reto.topeTotal < enRed.tope) {
        this.logger.warn(
          { eventoId, reto: reto.numero },
          'El tope bajó en la base, pero en la red no se puede bajar',
        );
      }
    }
    if (nuevos.length > 0) {
      await this.execute(eventoId, { operacion: 'add_retos', contratoId, retos: nuevos });
    }
    for (const [reto, tope] of subidas) {
      await this.execute(eventoId, { operacion: 'raise_tope', contratoId, reto, tope });
    }
    await this.repositorio.markRetosRegistrados(
      eventoId,
      [...nuevos, ...subidas].map(([numero]) => numero),
    );
  }

  /** Registra las llaves de las pantallas conectadas, juntas en una llamada, con la hora del ledger. */
  async registerPantallas(eventoId: string): Promise<void> {
    const contratoId = await this.getContratoId(eventoId);
    const pendientes = await this.repositorio.listPantallasSinRegistrar(eventoId);
    const porRegistrar: (readonly [number, Uint8Array])[] = [];
    for (const pantalla of pendientes) {
      const enRed = await this.stellar.getPantalla(contratoId, pantalla.numero);
      if (enRed) {
        await this.repositorio.markPantallaRegistrada(pantalla.id, enRed.registradaAt);
      } else if (pantalla.llavePublica) {
        porRegistrar.push([pantalla.numero, new Uint8Array(pantalla.llavePublica)]);
      }
    }
    if (porRegistrar.length === 0) {
      return;
    }
    await this.execute(eventoId, {
      operacion: 'add_pantallas',
      contratoId,
      pantallas: porRegistrar,
    });
    for (const pantalla of pendientes) {
      const enRed = await this.stellar.getPantalla(contratoId, pantalla.numero);
      if (enRed) {
        await this.repositorio.markPantallaRegistrada(pantalla.id, enRed.registradaAt);
      }
    }
  }

  /**
   * Ancla lo que quede sin esperar el intervalo, cierra el contrato con la huella final y los totales,
   * y guarda la evidencia (HU-105 §2). Si ya estaba cerrado, solo guarda la evidencia que falte.
   */
  async closeContrato(eventoId: string): Promise<void> {
    const contratoId = await this.getContratoId(eventoId);
    if ((await this.stellar.getEstado(contratoId)) === 'cerrado') {
      const evento = await this.getEvento(eventoId);
      if (evento.tipo === 'real' && !evento.enRedHasta) {
        await this.extendContrato(eventoId);
      }
      if (!evento.evidenciaSha256) {
        await this.evidencia?.saveEvidencia(eventoId);
      }
      await this.repositorio.setCierreEstado(eventoId, 'listo');
      return;
    }
    for (let paso = 0; ; paso++) {
      if (paso >= PASOS_CIERRE) {
        throw new Error('El cierre no terminó de anclar los lotes');
      }
      const resultado = await this.sellador.processEvento(eventoId, { forzar: true, cierre: true });
      if (resultado === 'detenido') {
        // HU-401 §4: no se arregla reintentando; el panel lo dice y Pasitos lo resuelve a mano.
        await this.repositorio.setCierreEstado(eventoId, 'fallido');
        throw new Error('Hay un lote rechazado: el contrato no se puede cerrar hasta resolverlo');
      }
      const pendientes = await this.repositorio.listLotesPendientes(eventoId);
      const sinLote = await this.repositorio.countMovimientosSinLote(eventoId);
      if (pendientes.length === 0 && sinLote === 0) {
        break;
      }
      await this.reloj.sleep(this.opciones.consultaCadaMs);
    }

    const ultimo = await this.stellar.getUltimo(contratoId);
    const ultimoLote = ultimo.n > 0 ? await this.repositorio.getLote(eventoId, ultimo.n) : null;
    const huellaFinal = ultimoLote
      ? new Uint8Array(ultimoLote.huella)
      : await buildGenesis(await buildEventoIdHash(eventoId));
    await this.execute(eventoId, {
      operacion: 'close',
      contratoId,
      nFinal: ultimo.n,
      huellaFinal,
      totales: await this.repositorio.getTotales(eventoId),
    });
    if (ultimoLote) {
      await this.repositorio.updateLote(ultimoLote.id, { esCierre: true });
    }
    this.logger.log({ eventoId, contratoId, nFinal: ultimo.n }, 'Contrato del evento cerrado');
    if ((await this.getEvento(eventoId)).tipo === 'real') {
      await this.extendContrato(eventoId);
    }
    await this.evidencia?.saveEvidencia(eventoId);
    await this.repositorio.setCierreEstado(eventoId, 'listo');
  }

  /**
   * D59: extiende ~6 meses la instancia, los retos y las pantallas (cada uno tiene su TTL) y el código
   * compartido, que sale casi gratis si otro evento ya lo extendió. Solo los eventos reales.
   * Repetirlo no hace daño: solo paga lo que falte hasta los 6 meses.
   */
  async extendContrato(eventoId: string): Promise<Date> {
    const contratoId = await this.getContratoId(eventoId);
    const incluida = await this.execute(eventoId, {
      operacion: 'extend_ttl',
      contratoId,
      ledgers: LEDGERS_EN_RED,
      retos: await this.repositorio.listNumerosRetosRegistrados(eventoId),
      pantallas: await this.repositorio.listNumerosPantallasRegistradas(eventoId),
      incluirCodigo: true,
    });
    const hasta = new Date(incluida.fecha.getTime() + LEDGERS_EN_RED * SEGUNDOS_POR_LEDGER * 1000);
    await this.repositorio.setEnRedHasta(eventoId, hasta);
    this.logger.log({ eventoId, hasta: hasta.toISOString() }, 'Datos del contrato extendidos');
    return hasta;
  }

  /**
   * Simula, firma, envía y espera la confirmación. Si venció sin entrar, la rearma (hasta 3 veces).
   * Cada intento enviado queda en transacciones_stellar (HU-104 §1).
   */
  async execute(eventoId: string | null, llamada: LlamadaContrato): Promise<Incluida> {
    for (let intento = 1; intento <= INTENTOS; intento++) {
      const tx = await this.stellar.prepare(llamada);
      // Extender los datos (D59) no tiene tope: cuesta ~1,3 XLM por evento y ya está previsto en el presupuesto.
      if (
        llamada.operacion !== 'extend_ttl' &&
        tx.comisionEstimadaStroops > this.opciones.comisionMaxPreparacionStroops
      ) {
        await this.alertas.raise({
          codigo: 'COMISION_SOBRE_TOPE',
          gravedad: 'aviso',
          ...(eventoId ? { eventoId } : {}),
          detalle: {
            operacion: llamada.operacion,
            comisionStroops: tx.comisionEstimadaStroops.toString(),
            topeStroops: this.opciones.comisionMaxPreparacionStroops.toString(),
          },
        });
        // El cierre del evento no espera: se envía igual y queda la alerta.
        if (llamada.operacion !== 'close') {
          throw new ComisionSobreTope(llamada.operacion, tx.comisionEstimadaStroops);
        }
      }
      await this.transacciones.insertEnviada({ eventoId, operacion: llamada.operacion, tx });
      try {
        await this.stellar.send(tx);
      } catch (error) {
        if (!(error instanceof StellarNoDisponible)) throw error;
        this.logger.warn(
          { operacion: llamada.operacion },
          'Sin respuesta al enviar; se consulta el resultado',
        );
      }
      // Validez de 60 s más un margen: pasado eso, se sabe que no entra y se rearma.
      const vence = tx.validaHasta.getTime() + this.opciones.margenVencimientoMs;
      for (;;) {
        const resultado = await this.stellar.getResultado(tx.hash);
        if (resultado.estado === 'incluida') {
          await this.transacciones.resolve(tx.hash, 'incluida', {
            comisionStroops: resultado.comisionStroops,
            ledger: resultado.ledger,
          });
          return resultado;
        }
        if (resultado.estado === 'fallida') {
          await this.transacciones.resolve(tx.hash, 'fallida', {
            comisionStroops: resultado.comisionStroops,
            ledger: resultado.ledger,
          });
          throw new Error(`La transacción ${llamada.operacion} falló en la red`);
        }
        if (this.reloj.now().getTime() > vence) {
          await this.transacciones.resolve(tx.hash, 'vencida');
          break;
        }
        await this.reloj.sleep(this.opciones.consultaCadaMs);
      }
    }
    throw new StellarNoDisponible(
      `La transacción ${llamada.operacion} no entró después de ${INTENTOS} intentos`,
    );
  }

  private async getEvento(eventoId: string) {
    const evento = await this.repositorio.getEvento(eventoId);
    if (!evento) {
      throw new Error(`Evento inexistente: ${eventoId}`);
    }
    return evento;
  }

  private async getContratoId(eventoId: string): Promise<string> {
    const evento = await this.getEvento(eventoId);
    if (!evento.contratoId) {
      throw new Error(`El evento ${eventoId} todavía no tiene contrato`);
    }
    return evento.contratoId;
  }
}
