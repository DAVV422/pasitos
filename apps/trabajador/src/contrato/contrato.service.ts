import { Logger } from '@nestjs/common';
import { buildEventoIdHash, buildGenesis, concatBytes, encodeUtf8, sha256 } from '@pasitos/firmas';
import {
  StellarNoDisponible,
  type LlamadaContrato,
  type ParNumerico,
  type ResultadoTx,
  type StellarPort,
} from '@pasitos/stellar';
import type { Reloj } from '../comun/reloj';
import type { SelladorRepository } from '../sellador/sellador.repository';
import type { SelladorService } from '../sellador/sellador.service';

type Incluida = Extract<ResultadoTx, { estado: 'incluida' }>;

export interface OpcionesContrato {
  readonly margenVencimientoMs: number;
  readonly consultaCadaMs: number;
}

const INTENTOS = 3;
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
    private readonly sellador: SelladorService,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesContrato,
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
      await this.execute({
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
      await this.execute({ operacion: 'add_retos', contratoId, retos: nuevos });
    }
    for (const [reto, tope] of subidas) {
      await this.execute({ operacion: 'raise_tope', contratoId, reto, tope });
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
    await this.execute({ operacion: 'add_pantallas', contratoId, pantallas: porRegistrar });
    for (const pantalla of pendientes) {
      const enRed = await this.stellar.getPantalla(contratoId, pantalla.numero);
      if (enRed) {
        await this.repositorio.markPantallaRegistrada(pantalla.id, enRed.registradaAt);
      }
    }
  }

  /** Ancla lo que quede sin esperar el intervalo y cierra el contrato con la huella final y los totales. */
  async closeContrato(eventoId: string): Promise<void> {
    const contratoId = await this.getContratoId(eventoId);
    if ((await this.stellar.getEstado(contratoId)) === 'cerrado') {
      return;
    }
    for (let paso = 0; ; paso++) {
      if (paso >= PASOS_CIERRE) {
        throw new Error('El cierre no terminó de anclar los lotes');
      }
      const resultado = await this.sellador.processEvento(eventoId, { forzar: true, cierre: true });
      if (resultado === 'detenido') {
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
    await this.execute({
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
  }

  /** Simula, firma, envía y espera la confirmación. Si venció sin entrar, la rearma (hasta 3 veces). */
  async execute(llamada: LlamadaContrato): Promise<Incluida> {
    for (let intento = 1; intento <= INTENTOS; intento++) {
      const tx = await this.stellar.prepare(llamada);
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
        if (resultado.estado === 'incluida') return resultado;
        if (resultado.estado === 'fallida') {
          throw new Error(`La transacción ${llamada.operacion} falló en la red`);
        }
        if (this.reloj.now().getTime() > vence) break;
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
