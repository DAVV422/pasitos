import { AppError, MENSAJE_CELULAR_REQUERIDO, type ModoCelular } from '@pasitos/dominio';

/**
 * El celular que se guarda según la regla del evento (HU-411 §3): con `no`, nada (aunque llegue);
 * con `obligatorio`, sin celular es `400 VALIDACION` en el campo `celular`.
 */
export function resolveCelular(modo: string, celular: string | null | undefined): string | null {
  const regla = modo as ModoCelular;
  if (regla === 'no') return null;
  if (regla === 'obligatorio' && !celular) {
    throw new AppError('VALIDACION', {
      errors: [{ field: 'celular', code: 'CELULAR_REQUERIDO', message: MENSAJE_CELULAR_REQUERIDO }],
    });
  }
  return celular ?? null;
}
