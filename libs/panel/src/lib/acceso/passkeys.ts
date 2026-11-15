/**
 * Passkeys en el navegador (HU-201 §4). @simplewebauthn/browser se carga solo aquí, al usarla,
 * para que no pese en el resto del panel.
 */
export function isPasskeyDisponible(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** La persona canceló o el tiempo se terminó: no es un error del sistema. */
export class PasskeyCanceladaError extends Error {
  constructor() {
    super('Cancelaste la passkey o se terminó el tiempo.');
    this.name = 'PasskeyCanceladaError';
  }
}

function toError(error: unknown): Error {
  const nombre = (error as { name?: string }).name;
  return nombre === 'NotAllowedError' || nombre === 'AbortError'
    ? new PasskeyCanceladaError()
    : error instanceof Error
      ? error
      : new Error(String(error));
}

export async function createPasskey(opciones: Record<string, unknown>): Promise<unknown> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  try {
    return await startRegistration({ optionsJSON: opciones as never });
  } catch (error) {
    throw toError(error);
  }
}

export async function usePasskey(opciones: Record<string, unknown>): Promise<unknown> {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  try {
    return await startAuthentication({ optionsJSON: opciones as never });
  } catch (error) {
    throw toError(error);
  }
}

/** "Passkey de Chrome en Windows", como nombre por defecto. */
export function getNombrePasskeyPorDefecto(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'el navegador';
  const sistema = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iPhone'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : null;
  return sistema ? `Passkey de ${navegador} en ${sistema}` : `Passkey de ${navegador}`;
}
