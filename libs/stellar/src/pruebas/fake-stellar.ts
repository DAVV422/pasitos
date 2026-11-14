import { buildGenesis, buildHuella, equalBytes, sha256, toHex } from '@pasitos/firmas';
import { ErrorContratoStellar, StellarNoDisponible } from '../errores';
import type {
  CierreContrato,
  EstadoContrato,
  EventoContrato,
  LlamadaContrato,
  ResultadoTx,
  StellarPort,
  TransaccionFirmada,
  UltimoLoteContrato,
} from '../tipos';

interface ContratoEnMemoria {
  estado: EstadoContrato;
  evento: EventoContrato;
  idHash: Uint8Array;
  cierre: CierreContrato | null;
  ultimo: UltimoLoteContrato;
  retos: Map<number, { tope: number; entregados: number }>;
  pantallas: Map<number, { llave: Uint8Array; registradaAt: Date }>;
}

const E = {
  EventoCerrado: 2,
  EventoPausado: 3,
  LoteFueraDeOrden: 4,
  HuellaAnteriorNoCoincide: 5,
  TopeSuperado: 6,
  RetoDesconocido: 7,
  TopeMenorAEntregados: 8,
  PantallaYaRegistrada: 9,
  LoteYaAnclado: 10,
  ConteosInvalidos: 11,
  TopeNoBaja: 12,
} as const;

const clonar = (c: ContratoEnMemoria): ContratoEnMemoria => ({
  ...c,
  ultimo: { ...c.ultimo },
  cierre: c.cierre,
  retos: new Map([...c.retos].map(([k, v]) => [k, { ...v }])),
  pantallas: new Map(c.pantallas),
});

/**
 * Stellar en memoria para los tests (HU-103 §2). Aplica las reglas del contrato (Contrato §2.3)
 * con las huellas de libs/firmas, y puede simular caídas, transacciones que no entran y respuestas perdidas.
 */
export class FakeStellar implements StellarPort {
  readonly red = 'local' as const;
  readonly operador = 'GOPERADORDEPRUEBA';

  /** Todas las llamadas fallan como si el RPC no respondiera. */
  caido = false;
  /** `send` aplica la transacción pero lanza un error (la respuesta se perdió). */
  perderRespuestaEnvio = false;
  /** `send` responde bien pero la transacción nunca entra en un ledger. */
  noIncluir = false;
  /** Reloj de la red (para la validez de las transacciones). */
  ahora: () => Date = () => new Date();
  /** Comisión que devuelve la simulación; la cobrada es el 90 % (HU-104). */
  comisionEstimada = 100_000n;
  /** Saldo del operador en stroops. Friendbot le suma 10 000 XLM. */
  saldo = 10_000_000_000n;
  fondosPedidos = 0;

  readonly contratos = new Map<string, ContratoEnMemoria>();
  readonly enviadas: LlamadaContrato[] = [];
  private readonly preparadas = new Map<string, LlamadaContrato>();
  private readonly resultados = new Map<string, ResultadoTx>();
  private ledger = 1;
  private secuencia = 0;

  computeContratoId(salt: Uint8Array): string {
    return `C${toHex(salt).slice(0, 55).toUpperCase()}`;
  }

  async prepare(llamada: LlamadaContrato): Promise<TransaccionFirmada> {
    this.assertDisponible();
    await this.apply(llamada, true);
    this.secuencia++;
    const hash = toHex(await sha256(new TextEncoder().encode(`tx-${this.secuencia}`)));
    this.preparadas.set(hash, llamada);
    return {
      hash,
      comisionEstimadaStroops: this.comisionEstimada,
      recursos: {
        instrucciones: 1_000_000,
        bytesLeidos: 1_000,
        bytesEscritos: 200,
        comisionRecursosStroops: String(this.comisionEstimada - 100n),
        entradasCreadas: llamada.operacion === 'anchor' ? 0 : 1,
      },
      validaHasta: new Date(this.ahora().getTime() + 60_000),
      xdr: hash,
    };
  }

  async send(tx: TransaccionFirmada): Promise<void> {
    this.assertDisponible();
    const llamada = this.preparadas.get(tx.hash);
    if (!llamada) {
      throw new Error('Transacción desconocida');
    }
    if (this.noIncluir) {
      return;
    }
    if (this.ahora() > tx.validaHasta) {
      return; // Venció: la red la descarta.
    }
    this.ledger++;
    try {
      const valor = await this.apply(llamada, false);
      this.enviadas.push(llamada);
      const cobrada = (tx.comisionEstimadaStroops * 9n) / 10n;
      this.saldo -= cobrada;
      this.resultados.set(tx.hash, {
        estado: 'incluida',
        ledger: this.ledger,
        fecha: this.ahora(),
        comisionStroops: cobrada,
        valor,
        envelopeXdr: `envelope-${tx.hash}`,
        resultXdr: `result-${tx.hash}`,
        resultMetaXdr: `meta-${tx.hash}`,
      });
    } catch (error) {
      if (!(error instanceof ErrorContratoStellar)) {
        throw error;
      }
      this.saldo -= 50_000n;
      this.resultados.set(tx.hash, {
        estado: 'fallida',
        ledger: this.ledger,
        comisionStroops: 50_000n,
        detalle: error.nombre,
      });
    }
    if (this.perderRespuestaEnvio) {
      throw new StellarNoDisponible('Se perdió la respuesta del envío');
    }
  }

  async getResultado(hash: string): Promise<ResultadoTx> {
    this.assertDisponible();
    return this.resultados.get(hash) ?? { estado: 'no_encontrada' };
  }

  async existsContrato(contratoId: string): Promise<boolean> {
    this.assertDisponible();
    return this.contratos.has(contratoId);
  }

  async getUltimo(contratoId: string): Promise<UltimoLoteContrato> {
    return { ...this.getContrato(contratoId).ultimo };
  }

  async getEstado(contratoId: string): Promise<EstadoContrato> {
    return this.getContrato(contratoId).estado;
  }

  async getReto(contratoId: string, numero: number) {
    const reto = this.getContrato(contratoId).retos.get(numero);
    return reto ? { ...reto } : null;
  }

  async getPantalla(contratoId: string, numero: number) {
    const pantalla = this.getContrato(contratoId).pantallas.get(numero);
    return pantalla ? { llavePublica: pantalla.llave, registradaAt: pantalla.registradaAt } : null;
  }

  async getEventoContrato(contratoId: string): Promise<EventoContrato> {
    return { ...this.getContrato(contratoId).evento };
  }

  async getCierre(contratoId: string): Promise<CierreContrato | null> {
    return this.getContrato(contratoId).cierre;
  }

  async getSaldoOperador(): Promise<bigint> {
    this.assertDisponible();
    return this.saldo;
  }

  async requestFondos(): Promise<void> {
    this.assertDisponible();
    this.fondosPedidos++;
    this.saldo += 100_000_000_000n;
  }

  /** Para los tests: olvida una transacción, como el RPC cuando pasa su ventana de historia. */
  forgetResultado(hash: string): void {
    this.resultados.delete(hash);
  }

  /** Para los tests: baja el tope de un reto en la red (provoca un lote rechazado). */
  setTope(contratoId: string, reto: number, tope: number): void {
    const info = this.getContrato(contratoId).retos.get(reto);
    if (info) {
      info.tope = tope;
    }
  }

  private getContrato(contratoId: string): ContratoEnMemoria {
    this.assertDisponible();
    const contrato = this.contratos.get(contratoId);
    if (!contrato) {
      throw new StellarNoDisponible(`Contrato inexistente: ${contratoId}`);
    }
    return contrato;
  }

  private assertDisponible(): void {
    if (this.caido) {
      throw new StellarNoDisponible('RPC caído (simulado)');
    }
  }

  /** Aplica la llamada con las reglas del contrato. Con `simular`, sobre una copia. */
  private async apply(
    llamada: LlamadaContrato,
    simular: boolean,
  ): Promise<Uint8Array | string | null> {
    const fallar = (codigo: number): never => {
      throw new ErrorContratoStellar(codigo);
    };
    const validarPares = (lista: readonly (readonly [number, number])[]) => {
      let anterior = 0;
      for (const [numero] of lista) {
        if (numero <= anterior) fallar(E.ConteosInvalidos);
        anterior = numero;
      }
    };

    if (llamada.operacion === 'deploy') {
      const id = this.computeContratoId(llamada.salt);
      if (this.contratos.has(id)) {
        throw new StellarNoDisponible('El contrato ya existe');
      }
      validarPares(llamada.retos);
      if (!simular) {
        this.contratos.set(id, {
          estado: 'activo',
          evento: { ...llamada.evento },
          cierre: null,
          idHash: llamada.evento.idHash,
          ultimo: { n: 0, huella: await buildGenesis(llamada.evento.idHash) },
          retos: new Map(llamada.retos.map(([n, tope]) => [n, { tope, entregados: 0 }])),
          pantallas: new Map(),
        });
      }
      return id;
    }

    if (llamada.operacion === 'upload_wasm') {
      return sha256(llamada.wasm);
    }
    const original = this.getContrato(llamada.contratoId);
    if (llamada.operacion === 'extend_ttl') {
      return null;
    }
    const c = simular ? clonar(original) : original;
    if (c.estado === 'cerrado') fallar(E.EventoCerrado);

    switch (llamada.operacion) {
      case 'anchor': {
        if (c.estado === 'pausado') fallar(E.EventoPausado);
        validarPares(llamada.conteos);
        const huella = await buildHuella({
          eventoIdHash: c.idHash,
          n: llamada.n,
          huellaAnterior: llamada.huellaAnterior,
          raiz: llamada.raiz,
          conteos: llamada.conteos,
        });
        if (llamada.n === c.ultimo.n && llamada.n > 0 && equalBytes(huella, c.ultimo.huella))
          fallar(E.LoteYaAnclado);
        if (llamada.n !== c.ultimo.n + 1) fallar(E.LoteFueraDeOrden);
        if (!equalBytes(llamada.huellaAnterior, c.ultimo.huella))
          fallar(E.HuellaAnteriorNoCoincide);
        for (const [reto, conteo] of llamada.conteos) {
          const info = c.retos.get(reto) ?? fallar(E.RetoDesconocido);
          if (info.entregados + conteo > info.tope) fallar(E.TopeSuperado);
        }
        for (const [reto, conteo] of llamada.conteos) {
          const info = c.retos.get(reto);
          if (info) info.entregados += conteo;
        }
        c.ultimo = { n: llamada.n, huella };
        return huella;
      }
      case 'add_retos':
        validarPares(llamada.retos);
        for (const [n, tope] of llamada.retos) {
          if (c.retos.has(n) || tope === 0) fallar(E.ConteosInvalidos);
          c.retos.set(n, { tope, entregados: 0 });
        }
        return null;
      case 'raise_tope': {
        const info = c.retos.get(llamada.reto) ?? fallar(E.RetoDesconocido);
        if (llamada.tope < info.entregados) fallar(E.TopeMenorAEntregados);
        if (llamada.tope < info.tope) fallar(E.TopeNoBaja);
        info.tope = llamada.tope;
        return null;
      }
      case 'add_pantallas':
        for (const [n, llave] of llamada.pantallas) {
          if (c.pantallas.has(n)) fallar(E.PantallaYaRegistrada);
          c.pantallas.set(n, { llave, registradaAt: this.ahora() });
        }
        return null;
      case 'close':
        if (llamada.nFinal !== c.ultimo.n) fallar(E.LoteFueraDeOrden);
        if (!equalBytes(llamada.huellaFinal, c.ultimo.huella)) fallar(E.HuellaAnteriorNoCoincide);
        c.estado = 'cerrado';
        c.cierre = {
          nFinal: llamada.nFinal,
          huellaFinal: llamada.huellaFinal,
          totales: llamada.totales,
          cerradoAt: Math.floor(this.ahora().getTime() / 1000),
        };
        return null;
    }
  }
}
