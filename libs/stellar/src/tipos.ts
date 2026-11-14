/**
 * Puerto de Stellar (HU-103 §2). El sellador y los trabajos del contrato hablan con la red solo
 * a través de esta interfaz; en los tests se reemplaza por FakeStellar.
 */

export type RedStellar = 'local' | 'testnet';
export type EstadoContrato = 'activo' | 'pausado' | 'cerrado';
export type ParNumerico = readonly [numero: number, valor: number];

export interface TotalesCierre {
  readonly participaciones: readonly ParNumerico[];
  readonly ganados: bigint;
  readonly canjeados: bigint;
  readonly ajustados: bigint;
  readonly vencidos: bigint;
}

/** Cada operación que el operador firma. Las del contrato y la creación de la instancia. */
export type LlamadaContrato =
  | {
      readonly operacion: 'deploy';
      readonly salt: Uint8Array;
      readonly evento: {
        readonly idHash: Uint8Array;
        readonly inicio: number;
        readonly fin: number;
      };
      readonly retos: readonly ParNumerico[];
    }
  | {
      readonly operacion: 'anchor';
      readonly contratoId: string;
      readonly n: number;
      readonly huellaAnterior: Uint8Array;
      readonly raiz: Uint8Array;
      readonly conteos: readonly ParNumerico[];
    }
  | {
      readonly operacion: 'add_retos';
      readonly contratoId: string;
      readonly retos: readonly ParNumerico[];
    }
  | {
      readonly operacion: 'raise_tope';
      readonly contratoId: string;
      readonly reto: number;
      readonly tope: number;
    }
  | {
      readonly operacion: 'add_pantallas';
      readonly contratoId: string;
      readonly pantallas: readonly (readonly [numero: number, llavePublica: Uint8Array])[];
    }
  | {
      readonly operacion: 'close';
      readonly contratoId: string;
      readonly nFinal: number;
      readonly huellaFinal: Uint8Array;
      readonly totales: TotalesCierre;
    }
  | {
      /** Instalar una versión del WASM (una vez por versión, HU-104 §5). */
      readonly operacion: 'upload_wasm';
      readonly wasm: Uint8Array;
    }
  | {
      /** Extender el tiempo de vida de los datos del contrato (Contrato §2.1). */
      readonly operacion: 'extend_ttl';
      readonly contratoId: string;
      /** Hasta cuántos ledgers desde el actual. */
      readonly ledgers: number;
      /** Los retos y pantallas viven aparte de la instancia (almacenamiento persistente), cada uno con su TTL. */
      readonly retos: readonly number[];
      readonly pantallas: readonly number[];
      /** El código (WASM) es uno para todos los eventos: se extiende aparte, no con cada contrato. */
      readonly incluirCodigo: boolean;
    };

/** Toda operación que firma el operador; es la columna `operacion` de `transacciones_stellar` (HU-104 §1). */
export type OperacionStellar = LlamadaContrato['operacion'];

export const OPERACIONES_STELLAR = [
  'upload_wasm',
  'deploy',
  'add_retos',
  'raise_tope',
  'add_pantallas',
  'anchor',
  'close',
  'extend_ttl',
] as const satisfies readonly OperacionStellar[];

/** Recursos de la simulación (HU-104 §1). Sin datos del evento. */
export interface RecursosTx {
  readonly instrucciones: number;
  readonly bytesLeidos: number;
  readonly bytesEscritos: number;
  /** Parte de recursos de la comisión (sin la base de 100 stroops). */
  readonly comisionRecursosStroops: string;
  /** Datos nuevos que la transacción crea en la red (pagan rent). */
  readonly entradasCreadas: number;
}

/** Transacción simulada, armada y firmada; todavía no enviada. */
export interface TransaccionFirmada {
  /** Hash de la transacción (hex), conocido antes de enviarla. */
  readonly hash: string;
  readonly comisionEstimadaStroops: bigint;
  readonly recursos: RecursosTx;
  /** Hasta cuándo la red la acepta (validez de 60 s). Después, se sabe que no entra. */
  readonly validaHasta: Date;
  /** XDR firmado (lo usa el adaptador para enviar). */
  readonly xdr: string;
}

export type ResultadoTx =
  | { readonly estado: 'pendiente' | 'no_encontrada' }
  | {
      readonly estado: 'incluida';
      readonly ledger: number;
      readonly fecha: Date;
      readonly comisionStroops: bigint;
      /** Lo que devolvió la función. En `anchor`, la huella (32 bytes). En `deploy`, la dirección del contrato. */
      readonly valor: Uint8Array | string | null;
      readonly envelopeXdr: string;
      readonly resultXdr: string;
      readonly resultMetaXdr: string;
    }
  | {
      readonly estado: 'fallida';
      readonly ledger: number;
      readonly comisionStroops: bigint;
      readonly detalle: string;
    };

export interface UltimoLoteContrato {
  readonly n: number;
  readonly huella: Uint8Array;
}

export interface EventoContrato {
  readonly idHash: Uint8Array;
  readonly inicio: number;
  readonly fin: number;
}

export interface CierreContrato {
  readonly nFinal: number;
  readonly huellaFinal: Uint8Array;
  readonly totales: TotalesCierre;
  readonly cerradoAt: number;
}

export interface StellarPort {
  readonly red: RedStellar;
  /** Frase de la red: con ella se comprueban las firmas de las transacciones (HU-105 §2). */
  readonly passphrase: string;
  /** Dirección pública del operador. */
  readonly operador: string;
  /** Simula, arma con los recursos de la simulación y firma. Lanza ErrorContratoStellar si el contrato la rechaza. */
  prepare(llamada: LlamadaContrato): Promise<TransaccionFirmada>;
  send(tx: TransaccionFirmada): Promise<void>;
  getResultado(hash: string): Promise<ResultadoTx>;
  computeContratoId(salt: Uint8Array): string;
  existsContrato(contratoId: string): Promise<boolean>;
  getUltimo(contratoId: string): Promise<UltimoLoteContrato>;
  getEstado(contratoId: string): Promise<EstadoContrato>;
  getReto(contratoId: string, numero: number): Promise<{ tope: number; entregados: number } | null>;
  getPantalla(
    contratoId: string,
    numero: number,
  ): Promise<{ llavePublica: Uint8Array; registradaAt: Date } | null>;
  getEventoContrato(contratoId: string): Promise<EventoContrato>;
  getCierre(contratoId: string): Promise<CierreContrato | null>;
  /** Saldo del operador en stroops. */
  getSaldoOperador(): Promise<bigint>;
  /** Pide fondos a Friendbot para el operador. Solo existe en testnet y en la red local. */
  requestFondos(): Promise<void>;
}
