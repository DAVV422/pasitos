import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Opción grande de selección única (radio). Ver mockup A21. */
@Component({
  selector: 'px-opcion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="px-opcion">
      <input
        type="radio"
        [name]="grupo()"
        [value]="valor()"
        [checked]="seleccionado() === valor()"
        (change)="seleccionado.set(valor())"
      />
      <span>
        <span class="px-opcion__titulo">{{ titulo() }}</span>
        @if (detalle(); as texto) {
          <span class="px-opcion__detalle">{{ texto }}</span>
        }
      </span>
    </label>
  `,
})
export class OpcionComponent {
  readonly grupo = input.required<string>();
  readonly valor = input.required<string>();
  readonly titulo = input.required<string>();
  readonly detalle = input<string | null>(null);
  readonly seleccionado = model<string | null>(null);
}
