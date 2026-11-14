/** Reloj inyectable (Backend §3): los tests prueban vencimientos sin esperar. */
export interface Reloj {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export const RELOJ_SISTEMA: Reloj = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
};
