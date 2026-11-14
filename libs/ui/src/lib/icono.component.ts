import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONOS, type ElementoSvg, type NombreIcono } from './iconos';

/**
 * Ícono SVG del set de los mockups. Si funciona como botón, el botón lleva su aria-label;
 * el ícono queda oculto para los lectores de pantalla. Se arma con elementos del template
 * (no con innerHTML) para que también se dibuje en el servidor.
 */
@Component({
  selector: 'px-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <svg
      class="px-icono"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      [style.width.px]="tamano()"
      [style.height.px]="tamano()"
    >
      @for (elemento of elementos(); track $index) {
        @switch (elemento.t) {
          @case ('path') {
            <svg:path [attr.d]="elemento.d" />
          }
          @case ('circle') {
            <svg:circle [attr.cx]="elemento.cx" [attr.cy]="elemento.cy" [attr.r]="elemento.r" />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="elemento.x"
              [attr.y]="elemento.y"
              [attr.width]="elemento.width"
              [attr.height]="elemento.height"
              [attr.rx]="elemento.rx"
            />
          }
        }
      }
    </svg>
  `,
})
export class IconoComponent {
  readonly nombre = input.required<NombreIcono>();
  readonly tamano = input(22);

  protected readonly elementos = computed<readonly ElementoSvg[]>(() => ICONOS[this.nombre()]);
}
