import { InjectionToken } from '@angular/core';
import type { DocumentoLegal, TipoDocumentoLegal } from '@pasitos/dominio/legal';

/**
 * De dónde sale el texto de los términos y la privacidad. Solo el servidor (el prerender) lo
 * tiene: `app.config.server.ts` le da `getDocumentoLegal`. El navegador lo recibe ya armado en el
 * estado transferido de la página, así el texto no entra en el JavaScript del sitio (Aplicaciones
 * web §0: el sitio tiene 80 KB).
 */
export const FUENTE_LEGAL = new InjectionToken<
  ((tipo: TipoDocumentoLegal) => DocumentoLegal) | null
>('FUENTE_LEGAL', { factory: () => null });
