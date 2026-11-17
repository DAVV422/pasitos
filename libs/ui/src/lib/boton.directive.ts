import { computed, Directive, input } from '@angular/core';

/**
 * - `primario`: la acción principal de la pantalla (una sola).
 * - `secundario`: otras acciones.
 * - `fantasma`: sin borde, para las acciones de cada fila.
 * - `peligro-contorno`: Quitar o Borrar en una lista (después se confirma).
 * - `peligro`: rojo lleno, solo para confirmar algo irreversible.
 */
export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'peligro-contorno';

/**
 * Botón de Pasitos sobre un `<button>` o `<a>` nativo (accesible por defecto).
 * Mientras `cargando` es true queda deshabilitado y muestra un indicador; el texto
 * del botón debe decir qué pasa (por ejemplo, "Confirmando…").
 */
@Directive({
  selector: 'button[pxBoton], a[pxBoton]',
  host: {
    '[class]': 'clases()',
    '[attr.aria-busy]': 'cargando() || null',
    '[attr.disabled]': 'cargando() || deshabilitado() ? "" : null',
  },
})
export class BotonDirective {
  readonly pxBoton = input<VarianteBoton | ''>('primario');
  readonly chico = input(false);
  /** De punta a punta (Entrar, Confirmar). En el panel, por defecto el botón mide su texto. */
  readonly bloque = input(false);
  readonly cargando = input(false);
  /**
   * Deshabilitado (por ejemplo, un formulario incompleto). Va por aquí y no con `[disabled]`: la
   * directiva maneja el atributo y un `[disabled]` aparte se pisaría con `cargando`.
   */
  readonly deshabilitado = input(false);

  protected readonly clases = computed(() => {
    const variante = this.pxBoton() || 'primario';
    return [
      'px-boton',
      `px-boton--${variante}`,
      this.chico() ? 'px-boton--chico' : '',
      this.bloque() ? 'px-boton--bloque' : '',
    ]
      .filter(Boolean)
      .join(' ');
  });
}
