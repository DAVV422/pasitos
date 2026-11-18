import { createParLlaves, exportLlavePublica, type LlavePublicaEc } from '@pasitos/firmas';

/**
 * Lo que el navegador del asistente guarda para ser **su llave** del evento (Acceso §5, HU-306 §5):
 * - la llave P-256 **no exportable**, en IndexedDB (`pasitos`);
 * - un id aleatorio del navegador, en tres lugares (IndexedDB, `localStorage` y la cookie
 *   `px_device`), para reconocerlo aunque se borre uno de ellos.
 *
 * Los puntos nunca viven en el navegador.
 */

const BASE = 'pasitos';
const ALMACEN = 'dispositivo';
const CLAVE_LLAVE = 'llave';
const CLAVE_ID = 'deviceId';
export const COOKIE_DISPOSITIVO = 'px_device';
const DOS_ANIOS_S = 2 * 365 * 24 * 60 * 60;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function run<T>(
  modo: IDBTransactionMode,
  paso: (almacen: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const base = await open();
  return new Promise<T>((resolve, reject) => {
    const pedido = paso(base.transaction(ALMACEN, modo).objectStore(ALMACEN));
    pedido.onsuccess = () => resolve(pedido.result as T);
    pedido.onerror = () => reject(pedido.error);
  });
}

function leerCookie(nombre: string): string | null {
  const encontrada = document.cookie.split('; ').find((parte) => parte.startsWith(`${nombre}=`));
  return encontrada ? decodeURIComponent(encontrada.slice(nombre.length + 1)) : null;
}

function escribirCookie(nombre: string, valor: string): void {
  const segura = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${nombre}=${encodeURIComponent(valor)}; Path=/; Max-Age=${DOS_ANIOS_S}; SameSite=Lax${segura}`;
}

function leerLocal(): string | null {
  try {
    return localStorage.getItem(COOKIE_DISPOSITIVO);
  } catch {
    return null;
  }
}

function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const VALIDO = /^[A-Za-z0-9_-]{22,64}$/;

/**
 * El id del navegador: el primero que encuentre en los tres lugares (o uno nuevo), y repone los
 * que falten.
 */
export async function getDeviceId(): Promise<string> {
  let enBase: string | null = null;
  try {
    enBase = (await run<string | undefined>('readonly', (a) => a.get(CLAVE_ID))) ?? null;
  } catch {
    enBase = null;
  }
  const encontrado = [enBase, leerLocal(), leerCookie(COOKIE_DISPOSITIVO)].find(
    (valor): valor is string => valor !== null && VALIDO.test(valor),
  );
  const id = encontrado ?? newDeviceId();
  if (enBase !== id) {
    await run('readwrite', (a) => a.put(id, CLAVE_ID)).catch(() => undefined);
  }
  try {
    localStorage.setItem(COOKIE_DISPOSITIVO, id);
  } catch {
    // Sin localStorage (bloqueado): quedan las otras dos copias.
  }
  escribirCookie(COOKIE_DISPOSITIVO, id);
  return id;
}

/** La llave del navegador: se crea una vez, **no exportable**, y se guarda en IndexedDB. */
export async function getParLlaves(): Promise<CryptoKeyPair> {
  const guardada = await run<CryptoKeyPair | undefined>('readonly', (a) => a.get(CLAVE_LLAVE));
  if (guardada) return guardada;
  const par = await createParLlaves();
  await run('readwrite', (a) => a.put(par, CLAVE_LLAVE));
  return par;
}

/** La parte pública, para mandarla al vincular. */
export async function getLlavePublicaAsistente(): Promise<LlavePublicaEc> {
  return exportLlavePublica(await getParLlaves());
}

/** Pide que el navegador no borre estos datos si le falta espacio. No bloquea si lo niega. */
export async function requestPersistencia(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Señal de modo incógnito: la cuota de almacenamiento es muy chica (Chrome y Edge dan unos 100 MB
 * en incógnito). Es una estimación: solo sirve para avisar, nunca para bloquear.
 */
export async function isPosibleIncognito(): Promise<boolean> {
  try {
    const estimado = await navigator.storage?.estimate?.();
    return estimado?.quota !== undefined && estimado.quota < 160 * 1024 * 1024;
  } catch {
    return false;
  }
}
