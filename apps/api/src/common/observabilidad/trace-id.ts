import { uuidv7 } from 'uuidv7';

/** Un X-Request-Id aceptable: corto y sin caracteres raros. Si no, se genera uno (T-005 §2). */
const TRACE_ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

export function resolveTraceId(cabecera: string | string[] | undefined): string {
  const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  return valor && TRACE_ID_VALIDO.test(valor) ? valor : uuidv7();
}
