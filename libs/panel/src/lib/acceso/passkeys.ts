/**
 * Passkeys en el navegador (HU-201 §4). @simplewebauthn/browser se carga solo en estas pantallas,
 * para que no pese en el resto del panel.
 *
 * **Safari en iPhone solo abre la passkey si se pide en el mismo toque.** Si antes de pedirla hay
 * que esperar al servidor (el desafío) o bajar la librería, la rechaza con `NotAllowedError`. Por
 * eso `PasskeyPreparada` trae las dos cosas al abrir la pantalla, y el toque la abre sin esperas.
 */
type Libreria = typeof import('@simplewebauthn/browser');

let libreria: Libreria | null = null;
let cargando: Promise<Libreria> | null = null;

function loadLibreria(): Promise<Libreria> {
  cargando ??= import('@simplewebauthn/browser').then((modulo) => (libreria = modulo));
  return cargando;
}

/** Gmail, WhatsApp, Instagram… abren los enlaces en su propio navegador: ahí la passkey suele fallar. */
export function isNavegadorDeOtraApp(): boolean {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\/|; wv\)/.test(ua);
}

export function isPasskeyDisponible(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

export type MotivoPasskey = 'cancelada' | 'ya_registrada' | 'dominio' | 'no_soportada' | 'otro';

const MENSAJES: Readonly<Record<MotivoPasskey, string>> = {
  cancelada:
    'La passkey no se completó: se canceló, se terminó el tiempo o el equipo no la permitió. Prueba de nuevo; si sigue sin funcionar, usa la app de códigos.',
  ya_registrada:
    'Este equipo ya tiene una passkey para tu cuenta. Úsala para entrar, o elige la app de códigos.',
  dominio:
    'Las passkeys funcionan solo en la dirección principal, sin «www». Ábrela y prueba de nuevo.',
  no_soportada:
    'Este navegador no permite passkeys. Usa la app de códigos, o Chrome o Safari actualizados.',
  otro: 'La passkey no funcionó en este equipo. Prueba de nuevo o usa la app de códigos.',
};

/** Lo que pasó en el navegador, con el nombre del error original para el diagnóstico. */
export class PasskeyError extends Error {
  constructor(
    readonly motivo: MotivoPasskey,
    readonly original: string,
  ) {
    super(MENSAJES[motivo]);
    this.name = 'PasskeyError';
  }
}

function toError(error: unknown): PasskeyError {
  const nombre = (error as { name?: string }).name ?? 'Error';
  const codigo = (error as { code?: string }).code ?? '';
  const motivo: MotivoPasskey =
    nombre === 'InvalidStateError' || codigo === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
      ? 'ya_registrada'
      : nombre === 'NotAllowedError' || nombre === 'AbortError'
        ? 'cancelada'
        : nombre === 'SecurityError' ||
            codigo === 'ERROR_INVALID_DOMAIN' ||
            codigo === 'ERROR_INVALID_RP_ID'
          ? 'dominio'
          : nombre === 'NotSupportedError'
            ? 'no_soportada'
            : 'otro';
  return new PasskeyError(motivo, codigo ? `${nombre}/${codigo}` : nombre);
}

/** El desafío del servidor vale 5 minutos: se pide otro si el que hay tiene más de 4. */
const VIGENCIA_DESAFIO_MS = 4 * 60 * 1000;

export class PasskeyPreparada {
  private opciones: Record<string, unknown> | null = null;
  private desde = 0;

  constructor(private readonly pedirOpciones: () => Promise<Record<string, unknown>>) {}

  private enCurso: Promise<void> | null = null;

  /**
   * Al abrir la pantalla y después de cada intento: el desafío se usa una sola vez. Si ya hay un
   * pedido en camino, se espera ese: el servidor guarda un solo desafío por sesión, y dos pedidos
   * cruzados dejarían al navegador con uno distinto del que el servidor espera.
   */
  prepare(): Promise<void> {
    this.enCurso ??= (async () => {
      this.opciones = null;
      try {
        const [, opciones] = await Promise.all([loadLibreria(), this.pedirOpciones()]);
        this.opciones = opciones;
        this.desde = Date.now();
      } finally {
        this.enCurso = null;
      }
    })();
    return this.enCurso;
  }

  get lista(): boolean {
    return (
      libreria !== null && this.opciones !== null && Date.now() - this.desde < VIGENCIA_DESAFIO_MS
    );
  }

  /** Crear una passkey (registro). Llamar directo desde el toque. */
  create(): Promise<unknown> {
    return this.run((lib, optionsJSON) =>
      lib.startRegistration({ optionsJSON: optionsJSON as never }),
    );
  }

  /** Usar una passkey (segundo factor). Llamar directo desde el toque. */
  use(): Promise<unknown> {
    return this.run((lib, optionsJSON) =>
      lib.startAuthentication({ optionsJSON: optionsJSON as never }),
    );
  }

  private async run(
    abrir: (lib: Libreria, opciones: Record<string, unknown>) => Promise<unknown>,
  ): Promise<unknown> {
    // Si está todo listo, `abrir` se llama sin ningún `await` antes: dentro del mismo toque.
    if (!this.lista) {
      await this.prepare();
    }
    const lib = libreria as Libreria;
    const opciones = this.opciones as Record<string, unknown>;
    this.opciones = null;
    try {
      return await abrir(lib, opciones);
    } catch (error) {
      throw toError(error);
    }
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
