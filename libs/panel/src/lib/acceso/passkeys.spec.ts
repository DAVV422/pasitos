import { vi } from 'vitest';

const startRegistration = vi.fn();
const startAuthentication = vi.fn();
vi.mock('@simplewebauthn/browser', () => ({ startRegistration, startAuthentication }));

const { PasskeyError, PasskeyPreparada } = await import('./passkeys');

describe('PasskeyPreparada', () => {
  beforeEach(() => {
    startRegistration.mockReset().mockResolvedValue({ id: 'credencial' });
    startAuthentication.mockReset().mockResolvedValue({ id: 'credencial' });
  });

  it('lista, abre la passkey en el mismo toque: sin ninguna espera antes (Safari en iPhone)', async () => {
    const pedir = vi.fn().mockResolvedValue({ challenge: 'uno' });
    const passkey = new PasskeyPreparada(pedir);
    await passkey.prepare();
    expect(passkey.lista).toBe(true);

    const respuesta = passkey.create();
    // Sincrónico: antes de cualquier `await`, la librería ya pidió la passkey al navegador.
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'uno' } });
    await expect(respuesta).resolves.toEqual({ id: 'credencial' });
  });

  it('el desafío se usa una sola vez; sin preparar, lo pide en el momento', async () => {
    const pedir = vi
      .fn()
      .mockResolvedValueOnce({ challenge: 'uno' })
      .mockResolvedValueOnce({ challenge: 'dos' });
    const passkey = new PasskeyPreparada(pedir);
    await passkey.prepare();
    await passkey.use();
    expect(passkey.lista).toBe(false);
    await passkey.use();
    expect(startAuthentication).toHaveBeenLastCalledWith({ optionsJSON: { challenge: 'dos' } });
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('si tocan mientras el desafío viene en camino, usa ese (no pide otro)', async () => {
    let entregar!: (valor: Record<string, unknown>) => void;
    const pedir = vi.fn(() => new Promise<Record<string, unknown>>((r) => (entregar = r)));
    const passkey = new PasskeyPreparada(pedir);
    void passkey.prepare();
    const respuesta = passkey.create();
    entregar({ challenge: 'uno' });
    await respuesta;
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'uno' } });
  });

  it.each([
    ['NotAllowedError', undefined, 'cancelada'],
    ['AbortError', undefined, 'cancelada'],
    ['InvalidStateError', 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', 'ya_registrada'],
    ['SecurityError', 'ERROR_INVALID_DOMAIN', 'dominio'],
    ['NotSupportedError', undefined, 'no_soportada'],
    ['UnknownError', undefined, 'otro'],
  ] as const)(
    '%s (%s) → %s, con el nombre original para el diagnóstico',
    async (nombre, codigo, motivo) => {
      startRegistration.mockRejectedValue(
        Object.assign(new Error('x'), { name: nombre, code: codigo }),
      );
      const passkey = new PasskeyPreparada(vi.fn().mockResolvedValue({ challenge: 'uno' }));
      const error = await passkey.create().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PasskeyError);
      expect(error).toMatchObject({ motivo, original: codigo ? `${nombre}/${codigo}` : nombre });
    },
  );
});
