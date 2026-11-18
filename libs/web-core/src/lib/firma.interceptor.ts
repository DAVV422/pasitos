import { HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';
import {
  HEADER_FIRMA,
  HEADER_IDEMPOTENCIA,
  HEADER_TIMESTAMP,
  hashCuerpo,
  signPedido,
} from '@pasitos/firmas';
import { from, switchMap } from 'rxjs';
import { getParLlaves } from './dispositivo-asistente';

/** Marca un pedido para firmarlo con la llave del navegador (HU-306 §4, API §2.1). */
export const FIRMAR = new HttpContextToken<boolean>(() => false);

/**
 * La `Idempotency-Key` del intento: se crea **al tocar el botón o leer el QR** y se reutiliza en
 * los reintentos automáticos (Aplicaciones web §2.6). Sin ella, el interceptor crea una.
 */
export const CLAVE_IDEMPOTENCIA = new HttpContextToken<string | null>(() => null);

/**
 * Firma los pedidos marcados con `FIRMAR`: el cuerpo viaja ya serializado, para que el hash que
 * firma el celular sea exactamente el de los bytes que recibe el servidor.
 */
export const firmaInterceptor: HttpInterceptorFn = (pedido, siguiente) => {
  if (!pedido.context.get(FIRMAR)) {
    return siguiente(pedido);
  }
  const clave = pedido.context.get(CLAVE_IDEMPOTENCIA) ?? crypto.randomUUID();
  const cuerpo = pedido.body === null ? '' : JSON.stringify(pedido.body);
  return from(
    (async () => {
      const { privateKey } = await getParLlaves();
      const timestamp = Date.now();
      const ruta = new URL(pedido.urlWithParams, location.origin).pathname;
      const firma = await signPedido(privateKey, {
        metodo: pedido.method,
        ruta,
        clave,
        timestamp,
        hashCuerpo: await hashCuerpo(cuerpo),
      });
      return pedido.clone({
        body: cuerpo,
        setHeaders: {
          'Content-Type': 'application/json',
          [HEADER_IDEMPOTENCIA]: clave,
          [HEADER_TIMESTAMP]: String(timestamp),
          [HEADER_FIRMA]: firma,
        },
      });
    })(),
  ).pipe(switchMap((firmado) => siguiente(firmado)));
};
