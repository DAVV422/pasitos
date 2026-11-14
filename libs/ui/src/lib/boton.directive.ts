import { computed, Directive, input } from '@angular/core';

export type VarianteBoton = 'primario' | 'secundario' | 'peligro';

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
    '[attr.disabled]': 'cargando() ? "" : null',
  },
})
export class BotonDirective {
  readonly pxBoton = input<VarianteBoton | ''>('primario');
  readonly chico = input(false);
  readonly cargando = input(false);

  protected readonly clases = computed(() => {
    const variante = this.pxBoton() || 'primario';
    return ['px-boton', `px-boton--${variante}`, this.chico() ? 'px-boton--chico' : '']
      .filter(Boolean)
      .join(' ');
  });
}
