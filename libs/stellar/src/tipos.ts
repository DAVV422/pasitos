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
    };

export type OperacionContrato = LlamadaContrato['operacion'];

/** Transacción simulada, armada y firmada; todavía no enviada. */
export interface TransaccionFirmada {
  /** Hash de la transacción (hex), conocido antes de enviarla. */
  readonly hash: string;
  readonly comisionEstimadaStroops: bigint;
  readonly recursos: Readonly<Record<string, unknown>>;
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

export interface StellarPort {
  readonly red: RedStellar;
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
  getPantalla(contratoId: string, numero: number): Promise<{ registradaAt: Date } | null>;
  getSaldoOperador(): Promise<bigint>;
}
