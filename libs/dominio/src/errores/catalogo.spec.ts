import { buildTipoError, CATALOGO_ERRORES, isCodigoError } from './catalogo';

describe('catálogo de errores', () => {
  it('arma el type en kebab', () => {
    expect(buildTipoError('SESION_VENCIDA')).toBe('urn:pasitos:error:sesion-vencida');
  });

  it('reconoce los códigos del catálogo', () => {
    expect(isCodigoError('VALIDACION')).toBe(true);
    expect(isCodigoError('INVENTADO')).toBe(false);
  });

  it('tiene un estado HTTP de error en cada código', () => {
    for (const definicion of Object.values(CATALOGO_ERRORES)) {
      expect(definicion.status).toBeGreaterThanOrEqual(400);
      expect(definicion.mensaje.length).toBeGreaterThan(0);
    }
  });
});
