/** Verifica el token de Cloudflare Turnstile (HU-410 §3). Una interfaz, para probar sin la red. */
export interface VerificadorTurnstile {
  /** `true` si Cloudflare lo acepta. */
  verify(token: string, ip: string): Promise<boolean>;
}

export const VERIFICADOR_TURNSTILE = Symbol('VERIFICADOR_TURNSTILE');

const URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export class TurnstileCloudflare implements VerificadorTurnstile {
  constructor(private readonly secreto: string) {}

  async verify(token: string, ip: string): Promise<boolean> {
    try {
      const respuesta = await fetch(URL_TURNSTILE, {
        method: 'POST',
        body: new URLSearchParams({ secret: this.secreto, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5_000),
      });
      const datos = (await respuesta.json()) as { success?: boolean };
      return datos.success === true;
    } catch {
      // Si Cloudflare no responde, no se guarda: mejor un reintento que spam.
      return false;
    }
  }
}
