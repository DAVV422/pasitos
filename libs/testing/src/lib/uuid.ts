import { uuidv7 } from 'uuidv7';

/** Id nuevo, igual que en producción (UUID v7). */
export function createId(): string {
  return uuidv7();
}
