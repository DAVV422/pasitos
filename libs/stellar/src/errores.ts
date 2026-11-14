/** Errores del contrato por código (contracts/evento/src/errores.rs, Contrato y sellador §2.4). */
export const ERRORES_CONTRATO = {
  1: 'NoAutorizado',
  2: 'EventoCerrado',
  3: 'EventoPausado',
  4: 'LoteFueraDeOrden',
  5: 'HuellaAnteriorNoCoincide',
  6: 'TopeSuperado',
  7: 'RetoDesconocido',
  8: 'TopeMenorAEntregados',
  9: 'PantallaYaRegistrada',
  10: 'LoteYaAnclado',
  11: 'ConteosInvalidos',
  12: 'TopeNoBaja',
} as const;

export type NombreErrorContrato = (typeof ERRORES_CONTRATO)[keyof typeof ERRORES_CONTRATO];

/** El contrato rechazó la llamada (en la simulación o al ejecutarla). No se reintenta igual. */
export class ErrorContratoStellar extends Error {
  readonly codigo: number;
  readonly nombre: NombreErrorContrato | 'Desconocido';

  constructor(codigo: number) {
    const nombre = ERRORES_CONTRATO[codigo as keyof typeof ERRORES_CONTRATO] ?? 'Desconocido';
    super(`El contrato rechazó la llamada: ${nombre} (${codigo})`);
    this.name = 'ErrorContratoStellar';
    this.codigo = codigo;
    this.nombre = nombre;
  }
}

/** La red o el RPC no respondieron. Se reintenta con espera creciente. */
export class StellarNoDisponible extends Error {
  constructor(mensaje: string, opciones?: { cause?: unknown }) {
    super(mensaje, opciones);
    this.name = 'StellarNoDisponible';
  }
}

/** `Error(Contract, #10)` en el texto de una simulación o un resultado → 10. */
export function findCodigoErrorContrato(texto: string): number | null {
  const coincidencia = /Error\(Contract, #(\d+)\)/.exec(texto);
  return coincidencia?.[1] ? Number(coincidencia[1]) : null;
}
