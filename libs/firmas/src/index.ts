/**
 * Huellas del libro, JSON canónico y pruebas de inclusión (HU-102).
 * Funciona igual en Node y en el navegador. Las firmas P-256 y el QR `PX1` llegan en la fase 3.
 * Formato: docs/version-piloto/07-contrato-y-sellador.md §4.
 */
export const VERSION_FORMATO_QR = 'PX1' as const;

export * from './bytes';
export * from './jcs';
export * from './huellas';
export * from './llaves';
export * from './firma-dispositivo';
export * from './qr-reto';
