import { RegistroPuertaCorreoGancho } from './invitados/registro-puerta-correo';
import { AlertasDiferidasService } from './acceso/alertas-diferidas.service';
import { VencerCobrosService } from './canjes/vencer-cobros.service';
import { BorradoDispositivosService } from './acceso/borrado-dispositivos.service';
import { buildCifrador, createConexion, type ConexionDb } from '@pasitos/db';
import { RpcStellar, TransaccionesStellarRepository, type StellarPort } from '@pasitos/stellar';
import { AlertasEnLogs } from './comun/alertas-operacion';
import { RELOJ_SISTEMA, type Reloj } from './comun/reloj';
import { readLlaveOperador, type TrabajadorConfig } from './config/trabajador.config';
import { ContratoService } from './contrato/contrato.service';
import { ArchivoAdapter, SmtpAdapter } from './correos/adaptadores';
import type { CorreoPort } from './correos/correo.port';
import { EnviosCorreoService } from './correos/envios.service';
import { CostoRedService } from './costo/costo-red.service';
import { PurgaArchivosService } from './archivos/purga.service';
import { AperturaEventosService } from './eventos/outbox.service';
import { InvitacionesCorreoGancho } from './invitados/invitaciones-correo';
import { OperacionesTrabajoService } from './invitados/operaciones.service';
import { ProcesarFotosService } from './fotos/procesar-fotos.service';
import { EvidenciaService } from './evidencia/evidencia.service';
import { SelladorRepository } from './sellador/sellador.repository';
import { OPCIONES_SELLADOR_POR_DEFECTO, SelladorService } from './sellador/sellador.service';

export interface Composicion {
  readonly conexion: ConexionDb;
  readonly stellar: StellarPort;
  readonly sellador: SelladorService;
  readonly contrato: ContratoService;
  readonly costo: CostoRedService;
  readonly transacciones: TransaccionesStellarRepository;
  readonly repositorio: SelladorRepository;
  readonly envios: EnviosCorreoService;
  readonly apertura: AperturaEventosService;
  readonly purga: PurgaArchivosService;
  readonly borrado: BorradoDispositivosService;
  readonly alertasDiferidas: AlertasDiferidasService;
  readonly vencerCobros: VencerCobrosService;
  readonly operaciones: OperacionesTrabajoService;
  readonly fotos: ProcesarFotosService;
}

/** Arma las piezas del trabajador. Los tests arman las mismas con FakeStellar y otro reloj. */
export function buildComposicion(
  config: TrabajadorConfig,
  opciones: {
    stellar?: StellarPort;
    reloj?: Reloj;
    correo?: CorreoPort;
    alErrorInactivo?: (error: Error) => void;
  } = {},
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
  const transacciones = new TransaccionesStellarRepository(conexion.db, stellar.red);
  const alertas = new AlertasEnLogs(reloj);
  const comisionMaxStroops = config.STELLAR_COMISION_MAX_STROOPS;
  const sellador = new SelladorService(repositorio, stellar, transacciones, alertas, reloj, {
    ...OPCIONES_SELLADOR_POR_DEFECTO,
    intervaloPorDefectoMin: config.ANCLAJE_INTERVALO_MIN,
    loteMax: config.ANCLAJE_LOTE_MAX,
    comisionMaxStroops,
  });
  const evidencia = new EvidenciaService(repositorio, stellar, transacciones, reloj, {
    archivosDir: config.ARCHIVOS_DIR,
    wasmHash: config.STELLAR_WASM_HASH ?? '',
  });
  const contrato = new ContratoService(
    repositorio,
    stellar,
    transacciones,
    sellador,
    alertas,
    reloj,
    {
      margenVencimientoMs: OPCIONES_SELLADOR_POR_DEFECTO.margenVencimientoMs,
      consultaCadaMs: OPCIONES_SELLADOR_POR_DEFECTO.consultaCadaMs,
      comisionMaxPreparacionStroops: config.STELLAR_COMISION_MAX_PREPARACION_STROOPS,
    },
    evidencia,
  );
  const costo = new CostoRedService(transacciones, stellar, alertas, reloj, {
    presupuestoMensualStroops: config.STELLAR_PRESUPUESTO_MENSUAL_STROOPS,
    comisionMaxStroops,
  });
  const envios = new EnviosCorreoService(
    conexion.db,
    opciones.correo ?? buildCorreoPort(config),
    { topeDiario: config.CORREO_TOPE_DIARIO, reservaSeguridad: config.CORREO_RESERVA_SEGURIDAD },
    reloj,
    {
      remitente: config.CORREO_REMITENTE,
      correoSoporte: config.CORREO_SOPORTE,
      porSegundo: config.CORREO_ENVIOS_POR_SEGUNDO,
      maxIntentos: 3,
      porVuelta: 50,
    },
    {
      registro_puerta: new RegistroPuertaCorreoGancho(conexion.db),
      invitacion_evento: new InvitacionesCorreoGancho(
        conexion.db,
        config.LLAVE_CIFRADO_DATOS
          ? buildCifrador(config.LLAVE_CIFRADO_DATOS, config.LLAVES_CIFRADO_ANTERIORES)
          : null,
      ),
    },
  );
  const apertura = new AperturaEventosService(conexion.db, alertas, reloj);
  return {
    conexion,
    stellar,
    sellador,
    contrato,
    costo,
    transacciones,
    repositorio,
    envios,
    apertura,
    borrado: new BorradoDispositivosService(conexion.db, reloj),
    alertasDiferidas: new AlertasDiferidasService(conexion.db, reloj),
    vencerCobros: new VencerCobrosService(conexion.db, reloj),
    purga: new PurgaArchivosService(conexion.db, config.ARCHIVOS_DIR, reloj),
    operaciones: new OperacionesTrabajoService(conexion.db, config.ARCHIVOS_DIR, reloj),
    fotos: new ProcesarFotosService(conexion.db, config.ARCHIVOS_DIR, reloj),
  };
}

/** SMTP (Mailpit) en desarrollo; archivos en los tests. Resend llega con el despliegue (T-002). */
export function buildCorreoPort(config: TrabajadorConfig): CorreoPort {
  return config.CORREO_ADAPTADOR === 'archivo'
    ? new ArchivoAdapter(config.CORREOS_DIR)
    : new SmtpAdapter(config.CORREO_SMTP_URL);
}
