/**
 * La última foto del servidor, para abrir sin conexión (HU-308 §4): *"Sin conexión · actualizado
 * hace 3 min"*. Vive en IndexedDB (`pasitos-app`), aparte de la llave del dispositivo. Nunca es la
 * fuente del saldo: al volver la red, manda el servidor.
 */
const BASE = 'pasitos-app';
const ALMACEN = 'copia';

export interface Copia<T> {
  readonly valor: T;
  readonly guardadaAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

export async function saveCopia<T>(clave: string, valor: T): Promise<void> {
  try {
    const base = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = base.transaction(ALMACEN, 'readwrite');
      tx.objectStore(ALMACEN).put({ valor, guardadaAt: Date.now() } satisfies Copia<T>, clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Sin IndexedDB (modo incógnito estricto): la app sigue, solo sin copia.
  }
}

export async function loadCopia<T>(clave: string): Promise<Copia<T> | null> {
  try {
    const base = await open();
    return await new Promise<Copia<T> | null>((resolve, reject) => {
      const pedido = base.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(clave);
      pedido.onsuccess = () => resolve((pedido.result as Copia<T> | undefined) ?? null);
      pedido.onerror = () => reject(pedido.error);
    });
  } catch {
    return null;
  }
}

/** Al anular el dispositivo o perder la sesión, la copia se borra. */
export async function clearCopias(): Promise<void> {
  try {
    const base = await open();
    base.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).clear();
  } catch {
    // Nada que borrar.
  }
}
