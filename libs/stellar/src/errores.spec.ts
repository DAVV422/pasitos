import { ErrorContratoStellar, ERRORES_CONTRATO, findCodigoErrorContrato } from './errores';

describe('errores del contrato', () => {
  it('lee el código del texto de una simulación', () => {
    expect(findCodigoErrorContrato('HostError: Error(Contract, #10)\n\nEvent log…')).toBe(10);
    expect(findCodigoErrorContrato('HostError: Error(Budget, ExceededLimit)')).toBeNull();
  });

  it('nombra cada código como el contrato (contracts/evento/src/errores.rs)', () => {
    expect(new ErrorContratoStellar(6).nombre).toBe('TopeSuperado');
    expect(new ErrorContratoStellar(12).nombre).toBe('TopeNoBaja');
    expect(new ErrorContratoStellar(99).nombre).toBe('Desconocido');
    expect(Object.keys(ERRORES_CONTRATO)).toHaveLength(12);
  });
});
