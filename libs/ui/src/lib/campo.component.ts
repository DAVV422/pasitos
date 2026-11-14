import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let siguienteId = 0;

/**
 * Campo de formulario: etiqueta siempre visible, ayuda y error debajo.
 * El control va proyectado y debe usar `[id]="campo.idControl"` y
 * `[attr.aria-describedby]="campo.idDescripcion"`.
 */
@Component({
  selector: 'px-campo',
  exportAs: 'pxCampo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'px-campo', '[class.px-campo--invalido]': '!!error()' },
  template: `
    <label class="px-campo__etiqueta" [attr.for]="idControl">
      {{ etiqueta() }}
      @if (opcional()) {
        <span class="px-campo__opcional">(opcional)</span>
      }
    </label>
    <ng-content />
    <div [id]="idDescripcion">
      @if (error(); as mensaje) {
        <span class="px-campo__error" role="alert">{{ mensaje }}</span>
      } @else if (ayuda(); as texto) {
        <span class="px-campo__ayuda">{{ texto }}</span>
      }
    </div>
  `,
})
export class CampoComponent {
  readonly etiqueta = input.required<string>();
  readonly ayuda = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly opcional = input(false);

  readonly idControl = `px-campo-${++siguienteId}`;
  readonly idDescripcion = `${this.idControl}-descripcion`;
}
