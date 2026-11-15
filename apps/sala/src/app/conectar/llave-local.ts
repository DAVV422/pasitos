import { createParLlaves, exportLlavePublica, type LlavePublicaEc } from '@pasitos/firmas';

const BASE = 'pasitos-sala';
const ALMACEN = 'llaves';
const CLAVE = 'pantalla';

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

/**
 * La llave de esta tablet (HU-209 §3): se crea una vez, no exportable, y se guarda en IndexedDB.
 * Volver a conectar la misma tablet manda la misma llave, así conserva su número en Stellar.
 */
export async function getLlavePublica(): Promise<LlavePublicaEc> {
  let par = await run<CryptoKeyPair | undefined>('readonly', (a) => a.get(CLAVE));
  if (!par) {
    const nuevo = await createParLlaves();
    await run('readwrite', (a) => a.put(nuevo, CLAVE));
    par = nuevo;
  }
  return exportLlavePublica(par);
}
