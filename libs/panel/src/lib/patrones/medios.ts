import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/** El corte entre celular y escritorio del panel (el mismo de `base.css`). */
export const CONSULTA_CELULAR = '(width < 768px)';

/**
 * Si la pantalla es de celular, como señal que cambia al girar o al achicar la ventana. Para lo
 * que el CSS no alcanza (por ejemplo, el alto fijo de las filas de una lista virtual). Se llama
 * dentro de un contexto de inyección.
 */
export function injectEsCelular(): Signal<boolean> {
  const consulta =
    typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_CELULAR) : null;
  const esCelular = signal(consulta?.matches ?? false);
  if (consulta) {
    const cambio = (evento: MediaQueryListEvent): void => esCelular.set(evento.matches);
    consulta.addEventListener('change', cambio);
    inject(DestroyRef).onDestroy(() => consulta.removeEventListener('change', cambio));
  }
  return esCelular.asReadonly();
}
