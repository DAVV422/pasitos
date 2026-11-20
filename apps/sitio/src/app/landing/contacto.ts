/**
 * El formulario de contacto (HU-410): las opciones, la llave de Turnstile y el envío. Las claves
 * de las opciones son las de `libs/dominio/src/contacto/esquemas.ts` (lo comprueba la prueba); aquí
 * se copian para no traer Zod al sitio.
 */
export const TIPOS_EVENTO: readonly { readonly valor: string; readonly texto: string }[] = [
  { valor: 'conferencia', texto: 'Conferencia o congreso' },
  { valor: 'meetup', texto: 'Meetup o comunidad' },
  { valor: 'feria', texto: 'Feria o exposición' },
  { valor: 'universidad', texto: 'Evento universitario' },
  { valor: 'otro', texto: 'Otro' },
];

export const ASISTENTES: readonly { readonly valor: string; readonly texto: string }[] = [
  { valor: 'menos_100', texto: 'Menos de 100' },
  { valor: '100_300', texto: 'Entre 100 y 300' },
  { valor: '300_1000', texto: 'Entre 300 y 1.000' },
  { valor: 'mas_1000', texto: 'Más de 1.000' },
];

/**
 * La llave pública de Cloudflare Turnstile. Vacía: el formulario va sin Turnstile (solo la trampa
 * y el límite por IP). Si llega spam, se pone aquí y `TURNSTILE_SECRETO` en el servidor.
 */
export const TURNSTILE_LLAVE_SITIO = '';

export interface ResultadoEnvio {
  readonly ok: boolean;
  readonly mensaje?: string;
  /** Errores por campo, como los devuelve el API (`errors`). */
  readonly campos?: Readonly<Record<string, string>>;
}

/** `POST /api/v1/publico/contacto`. Sin HttpClient: el sitio no lo carga (Aplicaciones web §0). */
export async function sendContacto(
  datos: Readonly<Record<string, unknown>>,
): Promise<ResultadoEnvio> {
  try {
    const respuesta = await fetch('/api/v1/publico/contacto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    if (respuesta.ok) return { ok: true };
    const problema = (await respuesta.json().catch(() => ({}))) as {
      detail?: string;
      errors?: readonly { field: string; message: string }[];
    };
    const campos = Object.fromEntries((problema.errors ?? []).map((e) => [e.field, e.message]));
    return {
      ok: false,
      mensaje: problema.detail ?? 'No pudimos enviar tu mensaje. Intenta de nuevo.',
      ...(Object.keys(campos).length > 0 ? { campos } : {}),
    };
  } catch {
    return { ok: false, mensaje: 'No hay conexión. Intenta de nuevo en un momento.' };
  }
}
