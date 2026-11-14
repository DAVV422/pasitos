import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Tarjeta: superficie con borde. */
@Component({
  selector: 'px-tarjeta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'px-tarjeta', '[class.px-tarjeta--destacada]': 'destacada()' },
  template: `<ng-content />`,
})
export class TarjetaComponent {
  readonly destacada = input(false);
}

/** Fila etiqueta–valor (por ejemplo, "Dispositivo · Samsung A14 · Chrome"). */
@Component({
  selector: 'px-fila-dato',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'px-fila-dato' },
  template: `<span>{{ etiqueta() }}</span
    ><span class="px-fila-dato__valor"><ng-content /></span>`,
})
export class FilaDatoComponent {
  readonly etiqueta = input.required<string>();
}
