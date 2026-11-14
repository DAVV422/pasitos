import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  hash,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { ErrorContratoStellar, StellarNoDisponible, findCodigoErrorContrato } from './errores';
import type {
  EstadoContrato,
  LlamadaContrato,
  ParNumerico,
  RedStellar,
  ResultadoTx,
  StellarPort,
  TransaccionFirmada,
  UltimoLoteContrato,
} from './tipos';

export interface OpcionesRpcStellar {
  readonly red: RedStellar;
  readonly rpcUrl: string;
  /** Llave secreta del operador (S…). Solo en memoria. */
  readonly llaveOperador: string;
  readonly adminDireccion: string;
  readonly wasmHash?: string;
}

const PASSPHRASES: Record<RedStellar, string> = {
  local: Networks.STANDALONE,
  testnet: Networks.TESTNET,
};

/** Validez de cada transacción (HU-103 §2): pasado este tiempo, si no entró, ya no entra. */
const VALIDEZ_SEGUNDOS = 60;

const u32 = (valor: number) => nativeToScVal(valor, { type: 'u32' });
const u64 = (valor: number) => nativeToScVal(BigInt(valor), { type: 'u64' });
const i128 = (valor: bigint) => nativeToScVal(valor, { type: 'i128' });
const bytes = (valor: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(valor));
const pares = (lista: readonly ParNumerico[]) =>
  xdr.ScVal.scvVec(lista.map(([a, b]) => xdr.ScVal.scvVec([u32(a), u32(b)])));
/** Un struct de Soroban es un mapa con claves símbolo ordenadas. */
const struct = (campos: Record<string, xdr.ScVal>) =>
  xdr.ScVal.scvMap(
    Object.keys(campos)
      .sort()
      .map(
        (clave) =>
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(clave), val: campos[clave] as xdr.ScVal }),
      ),
  );

/** Adaptador de Stellar con el RPC (Soroban RPC) y @stellar/stellar-sdk. Lo usa solo el trabajador. */
export class RpcStellar implements StellarPort {
  readonly red: RedStellar;
  readonly operador: string;
  private readonly servidor: rpc.Server;
  private readonly passphrase: string;
  private readonly adminDireccion: string;
  private readonly wasmHash: string | undefined;
  /** Campo privado de verdad: no sale en JSON.stringify, util.inspect ni en los logs. */
  readonly #llave: Keypair;

  constructor(opciones: OpcionesRpcStellar) {
    this.red = opciones.red;
    this.passphrase = PASSPHRASES[opciones.red];
    this.#llave = Keypair.fromSecret(opciones.llaveOperador);
    this.operador = this.#llave.publicKey();
    this.adminDireccion = opciones.adminDireccion;
    this.wasmHash = opciones.wasmHash;
    this.servidor = new rpc.Server(opciones.rpcUrl, {
      allowHttp: opciones.rpcUrl.startsWith('http://'),
    });
  }

  computeContratoId(salt: Uint8Array): string {
    const preimagen = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId: hash(Buffer.from(this.passphrase)),
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: Address.fromString(this.operador).toScAddress(),
            salt: Buffer.from(salt),
          }),
        ),
      }),
    );
    return StrKey.encodeContract(hash(preimagen.toXDR()));
  }

  async prepare(llamada: LlamadaContrato): Promise<TransaccionFirmada> {
    const operacion = this.buildOperacion(llamada);
    const cuenta = await this.call(() => this.servidor.getAccount(this.operador));
    const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(operacion)
      .setTimeout(VALIDEZ_SEGUNDOS)
      .build();
    const simulacion = await this.call(() => this.servidor.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(simulacion)) {
      throw this.toError(simulacion.error);
    }
    const armada = rpc.assembleTransaction(tx, simulacion).build();
    armada.sign(this.#llave);
    const maxTime = Number(armada.timeBounds?.maxTime ?? 0);
    return {
      hash: Buffer.from(armada.hash()).toString('hex'),
      comisionEstimadaStroops: BigInt(armada.fee),
      recursos: { minResourceFee: simulacion.minResourceFee },
      validaHasta: new Date(maxTime * 1000),
      xdr: armada.toXDR(),
    };
  }

  async send(tx: TransaccionFirmada): Promise<void> {
    const transaccion = TransactionBuilder.fromXDR(tx.xdr, this.passphrase);
    const respuesta = await this.call(() => this.servidor.sendTransaction(transaccion));
    if (respuesta.status === 'ERROR') {
      const detalle = respuesta.errorResult?.toXDR('base64') ?? 'sin detalle';
      throw new StellarNoDisponible(`La red rechazó la transacción al recibirla: ${detalle}`);
    }
    if (respuesta.status === 'TRY_AGAIN_LATER') {
      throw new StellarNoDisponible('La red pidió intentar más tarde');
    }
  }

  async getResultado(hashTx: string): Promise<ResultadoTx> {
    const respuesta = await this.call(() => this.servidor.getTransaction(hashTx));
    switch (respuesta.status) {
      case rpc.Api.GetTransactionStatus.NOT_FOUND:
        return { estado: 'no_encontrada' };
      case rpc.Api.GetTransactionStatus.FAILED:
        return {
          estado: 'fallida',
          ledger: respuesta.ledger,
          comisionStroops: BigInt(respuesta.resultXdr.feeCharged),
          detalle: respuesta.resultXdr.toXdr('base64'),
        };
      case rpc.Api.GetTransactionStatus.SUCCESS: {
        const nativo: unknown = respuesta.returnValue ? scValToNative(respuesta.returnValue) : null;
        const valor =
          nativo instanceof Uint8Array
            ? new Uint8Array(nativo)
            : typeof nativo === 'string'
              ? nativo
              : null;
        return {
          estado: 'incluida',
          ledger: respuesta.ledger,
          fecha: new Date(respuesta.createdAt * 1000),
          comisionStroops: BigInt(respuesta.resultXdr.feeCharged),
          valor,
          envelopeXdr: respuesta.envelopeXdr.toXdr('base64'),
          resultXdr: respuesta.resultXdr.toXdr('base64'),
          resultMetaXdr: respuesta.resultMetaXdr.toXdr('base64'),
        };
      }
    }
  }

  async existsContrato(contratoId: string): Promise<boolean> {
    const clave = new Contract(contratoId).getFootprint();
    const respuesta = await this.call(() => this.servidor.getLedgerEntries(clave));
    return respuesta.entries.length > 0;
  }

  async getUltimo(contratoId: string): Promise<UltimoLoteContrato> {
    const valor = (await this.read(contratoId, 'get_ultimo')) as { n: number; huella: Buffer };
    return { n: Number(valor.n), huella: new Uint8Array(valor.huella) };
  }

  async getEstado(contratoId: string): Promise<EstadoContrato> {
    const valor = (await this.read(contratoId, 'get_estado')) as [string];
    return valor[0].toLowerCase() as EstadoContrato;
  }

  async getReto(contratoId: string, numero: number) {
    const valor = (await this.read(contratoId, 'get_reto', [u32(numero)])) as
      { tope: number; entregados: number } | undefined;
    return valor ? { tope: Number(valor.tope), entregados: Number(valor.entregados) } : null;
  }

  async getPantalla(contratoId: string, numero: number) {
    const valor = (await this.read(contratoId, 'get_pantalla', [u32(numero)])) as
      { registrada_at: bigint } | undefined;
    return valor ? { registradaAt: new Date(Number(valor.registrada_at) * 1000) } : null;
  }

  async getSaldoOperador(): Promise<bigint> {
    const cuenta = await this.call(() => this.servidor.getAccountEntry(this.operador));
    return BigInt(cuenta.balance);
  }

  /** Llama a un getter simulando: no se firma ni se paga. */
  private async read(
    contratoId: string,
    funcion: string,
    args: xdr.ScVal[] = [],
  ): Promise<unknown> {
    const cuenta = await this.call(() => this.servidor.getAccount(this.operador));
    const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(new Contract(contratoId).call(funcion, ...args))
      .setTimeout(VALIDEZ_SEGUNDOS)
      .build();
    const simulacion = await this.call(() => this.servidor.simulateTransaction(tx));
    if (rpc.Api.isSimulationError(simulacion)) {
      throw this.toError(simulacion.error);
    }
    const retorno = simulacion.result?.retval;
    return retorno ? scValToNative(retorno) : undefined;
  }

  private buildOperacion(llamada: LlamadaContrato): xdr.Operation {
    if (llamada.operacion === 'deploy') {
      if (!this.wasmHash) {
        throw new Error('Falta STELLAR_WASM_HASH para crear el contrato');
      }
      return Operation.createCustomContract({
        address: Address.fromString(this.operador),
        wasmHash: Buffer.from(this.wasmHash, 'hex'),
        salt: Buffer.from(llamada.salt),
        constructorArgs: [
          new Address(this.adminDireccion).toScVal(),
          new Address(this.operador).toScVal(),
          struct({
            id_hash: bytes(llamada.evento.idHash),
            inicio: u64(llamada.evento.inicio),
            fin: u64(llamada.evento.fin),
          }),
          pares(llamada.retos),
        ],
      });
    }
    const contrato = new Contract(llamada.contratoId);
    switch (llamada.operacion) {
      case 'anchor':
        return contrato.call(
          'anchor',
          u32(llamada.n),
          bytes(llamada.huellaAnterior),
          bytes(llamada.raiz),
          pares(llamada.conteos),
        );
      case 'add_retos':
        return contrato.call('add_retos', pares(llamada.retos));
      case 'raise_tope':
        return contrato.call('raise_tope', u32(llamada.reto), u32(llamada.tope));
      case 'add_pantallas':
        return contrato.call(
          'add_pantallas',
          xdr.ScVal.scvVec(
            llamada.pantallas.map(([n, llave]) => xdr.ScVal.scvVec([u32(n), bytes(llave)])),
          ),
        );
      case 'close':
        return contrato.call(
          'close',
          u32(llamada.nFinal),
          bytes(llamada.huellaFinal),
          struct({
            participaciones: pares(llamada.totales.participaciones),
            ganados: i128(llamada.totales.ganados),
            canjeados: i128(llamada.totales.canjeados),
            ajustados: i128(llamada.totales.ajustados),
            vencidos: i128(llamada.totales.vencidos),
          }),
        );
    }
  }

  private toError(texto: string): Error {
    const codigo = findCodigoErrorContrato(texto);
    return codigo === null
      ? new StellarNoDisponible(`La simulación falló: ${texto.slice(0, 300)}`)
      : new ErrorContratoStellar(codigo);
  }

  /** Cualquier falla de red o del RPC se vuelve StellarNoDisponible (se reintenta). */
  private async call<T>(trabajo: () => Promise<T>): Promise<T> {
    try {
      return await trabajo();
    } catch (error) {
      if (error instanceof ErrorContratoStellar || error instanceof StellarNoDisponible) {
        throw error;
      }
      throw new StellarNoDisponible('El RPC de Stellar no respondió', { cause: error });
    }
  }
}
