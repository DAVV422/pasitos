import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { encodeUtf8, sha256, toHex } from '@pasitos/firmas';
import type { StellarPort, TransaccionesStellarRepository } from '@pasitos/stellar';
import type { Reloj } from '../comun/reloj';
import type { SelladorRepository } from '../sellador/sellador.repository';
import { serializeEvidencia, type EvidenciaStellar, type TransaccionEvidencia } from './evidencia';

export interface OpcionesEvidencia {
  /** Volumen de archivos: la evidencia va en publicos/<organización>/<evento>/. */
  readonly archivosDir: string;
  readonly wasmHash: string;
}

/** Versión del contrato instalado (contracts/evento: `version()`). */
export const VERSION_CONTRATO = 1;
export const NOMBRE_EVIDENCIA = 'evidencia-stellar.json';

export interface EvidenciaGuardada {
  readonly ruta: string;
  readonly sha256: string;
  readonly incompleta: boolean;
}

/**
 * Arma `evidencia-stellar.json` apenas cierra el contrato (HU-105 §2): después, el RPC de testnet puede
 * ya no tener las transacciones viejas. Su SHA-256 queda en `eventos.evidencia_sha256`.
 */
export class EvidenciaService {
  private readonly logger = new Logger('Evidencia');

  constructor(
    private readonly repositorio: SelladorRepository,
    private readonly stellar: StellarPort,
    private readonly transacciones: TransaccionesStellarRepository,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesEvidencia,
  ) {}

  async buildEvidencia(eventoId: string): Promise<EvidenciaStellar> {
    const evento = await this.repositorio.getEvento(eventoId);
    if (!evento?.contratoId) {
      throw new Error(`El evento ${eventoId} no tiene contrato`);
    }
    const contratoId = evento.contratoId;

    const infoEvento = await this.stellar.getEventoContrato(contratoId);
    const retos: EvidenciaStellar['estado']['retos'] = {};
    for (const numero of await this.repositorio.listNumerosRetosRegistrados(eventoId)) {
      const reto = await this.stellar.getReto(contratoId, numero);
      if (reto) retos[String(numero)] = reto;
    }
    const pantallas: EvidenciaStellar['estado']['pantallas'] = {};
    for (const numero of await this.repositorio.listNumerosPantallasRegistradas(eventoId)) {
      const pantalla = await this.stellar.getPantalla(contratoId, numero);
      if (pantalla) {
        pantallas[String(numero)] = {
          llavePublica: toHex(pantalla.llavePublica),
          registradaAt: Math.floor(pantalla.registradaAt.getTime() / 1000),
        };
      }
    }
    const ultimo = await this.stellar.getUltimo(contratoId);
    const cierre = await this.stellar.getCierre(contratoId);

    const numerosLote = await this.repositorio.listNumerosLote(eventoId);
    const transacciones: TransaccionEvidencia[] = [];
    const faltantes: { operacion: string; txHash: string }[] = [];
    for (const fila of await this.transacciones.listIncluidas(eventoId)) {
      const resultado = await this.stellar.getResultado(fila.txHash);
      if (resultado.estado !== 'incluida') {
        faltantes.push({ operacion: fila.operacion, txHash: fila.txHash });
        continue;
      }
      const lote = fila.loteId ? numerosLote.get(fila.loteId) : undefined;
      transacciones.push({
        operacion: fila.operacion,
        ...(lote ? { lote } : {}),
        txHash: fila.txHash,
        ledger: resultado.ledger,
        fecha: resultado.fecha.toISOString(),
        comisionStroops: Number(resultado.comisionStroops),
        envelopeXdr: resultado.envelopeXdr,
        resultXdr: resultado.resultXdr,
        resultMetaXdr: resultado.resultMetaXdr,
      });
    }

    return {
      version: 1,
      red: this.stellar.red,
      redPassphrase: this.stellar.passphrase,
      contrato: contratoId,
      wasmHash: this.opciones.wasmHash,
      versionContrato: VERSION_CONTRATO,
      generadoAt: this.reloj.now().toISOString(),
      estado: {
        evento: {
          idHash: toHex(infoEvento.idHash),
          inicio: infoEvento.inicio,
          fin: infoEvento.fin,
        },
        retos,
        pantallas,
        ultimo: { n: ultimo.n, huella: toHex(ultimo.huella) },
        cierre: cierre
          ? {
              nFinal: cierre.nFinal,
              huellaFinal: toHex(cierre.huellaFinal),
              cerradoAt: cierre.cerradoAt,
              totales: {
                participaciones: Object.fromEntries(
                  cierre.totales.participaciones.map(([numero, total]) => [String(numero), total]),
                ),
                ganados: cierre.totales.ganados.toString(),
                canjeados: cierre.totales.canjeados.toString(),
                ajustados: cierre.totales.ajustados.toString(),
                vencidos: cierre.totales.vencidos.toString(),
              },
            }
          : null,
      },
      transacciones,
      ...(faltantes.length > 0 ? { incompleta: true as const, faltantes } : {}),
    };
  }

  /** Arma la evidencia, la guarda junto a los archivos públicos del evento y anota su SHA-256. */
  async saveEvidencia(eventoId: string): Promise<EvidenciaGuardada> {
    const evento = await this.repositorio.getEvento(eventoId);
    if (!evento) {
      throw new Error(`Evento inexistente: ${eventoId}`);
    }
    const evidencia = await this.buildEvidencia(eventoId);
    const contenido = serializeEvidencia(evidencia);
    const huella = toHex(await sha256(encodeUtf8(contenido)));
    const carpeta = join(this.opciones.archivosDir, 'publicos', evento.organizacionId, eventoId);
    await mkdir(carpeta, { recursive: true });
    const ruta = join(carpeta, NOMBRE_EVIDENCIA);
    await writeFile(ruta, contenido, 'utf-8');
    await this.repositorio.setEvidenciaSha256(eventoId, huella);
    const incompleta = evidencia.incompleta === true;
    if (incompleta) {
      this.logger.warn(
        { eventoId, faltantes: evidencia.faltantes?.length },
        'Evidencia incompleta: el RPC ya no tenía algunas transacciones',
      );
    } else {
      this.logger.log(
        { eventoId, transacciones: evidencia.transacciones.length },
        'Evidencia guardada',
      );
    }
    return { ruta, sha256: huella, incompleta };
  }
}
