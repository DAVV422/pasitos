/**
 * Los datos que completan los términos y la política de privacidad (HU-407). **Es lo único que
 * hay que cambiar** para publicar los correos o mover la fecha: los textos (docs/05-seguridad-legal)
 * y las páginas del sitio no se tocan.
 *
 * Un correo vacío se muestra como *"(correo por publicar)"*. Después de cambiar algo aquí, alcanza
 * con volver a compilar el sitio.
 */
export const CONFIG_LEGAL = {
  /** Consultas y reclamos (Términos §1, §12 y §14). Por ejemplo `hola@` y el dominio del sitio. */
  correoContacto: '',
  /** Temas de privacidad (Política §1, §8 y §13). Por ejemplo `privacidad@` y el dominio del sitio. */
  correoPrivacidad: '',
  /** La dirección pública del sitio, sin `/` al final. */
  sitio: 'https://pasitos.com.bo',
  /** Desde cuándo valen los textos publicados, `AAAA-MM-DD`. */
  vigenteDesde: '2026-11-21',
} as const;

export type ConfigLegal = { readonly [K in keyof typeof CONFIG_LEGAL]: string };
