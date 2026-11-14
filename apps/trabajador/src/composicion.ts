import { createConexion, type ConexionDb } from '@pasitos/db';
import { RpcStellar, type StellarPort } from '@pasitos/stellar';
import { AlertasEnLogs } from './comun/alertas-operacion';
import { RELOJ_SISTEMA, type Reloj } from './comun/reloj';
import { readLlaveOperador, type TrabajadorConfig } from './config/trabajador.config';
import { ContratoService } from './contrato/contrato.service';
import { SelladorRepository } from './sellador/sellador.repository';
import { OPCIONES_SELLADOR_POR_DEFECTO, SelladorService } from './sellador/sellador.service';

export interface Composicion {
  readonly conexion: ConexionDb;
  readonly stellar: StellarPort;
  readonly sellador: SelladorService;
  readonly contrato: ContratoService;
}

/** Arma las piezas del trabajador. Los tests arman las mismas con FakeStellar y otro reloj. */
export function buildComposicion(
  config: TrabajadorConfig,
  opciones: { stellar?: StellarPort; reloj?: Reloj; alErrorInactivo?: (error: Error) => void } = {},
): Composicion {
  const reloj = opciones.reloj ?? RELOJ_SISTEMA;
  const conexion = createConexion(
    config.DATABASE_URL_SISTEMA,
    { max: 5 },
    opciones.alErrorInactivo,
  );
  const stellar =
    opciones.stellar ??
    new RpcStellar({
      red: config.STELLAR_RED,
      rpcUrl: config.STELLAR_RPC_URL,
      llaveOperador: readLlaveOperador(config.STELLAR_OPERADOR_LLAVE_ARCHIVO),
      adminDireccion: config.STELLAR_ADMIN_DIRECCION,
      ...(config.STELLAR_WASM_HASH ? { wasmHash: config.STELLAR_WASM_HASH } : {}),
    });
  const repositorio = new SelladorRepository(conexion.db);
  const sellador = new SelladorService(repositorio, stellar, new AlertasEnLogs(reloj), reloj, {
    ...OPCIONES_SELLADOR_POR_DEFECTO,
    intervaloPorDefectoMin: config.ANCLAJE_INTERVALO_MIN,
    loteMax: config.ANCLAJE_LOTE_MAX,
  });
  const contrato = new ContratoService(repositorio, stellar, sellador, reloj, {
    margenVencimientoMs: OPCIONES_SELLADOR_POR_DEFECTO.margenVencimientoMs,
    consultaCadaMs: OPCIONES_SELLADOR_POR_DEFECTO.consultaCadaMs,
  });
  return { conexion, stellar, sellador, contrato };
}
