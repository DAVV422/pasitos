import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface Pestana<T extends string = string> {
  readonly clave: T;
  readonly texto: string;
}

let siguienteId = 0;

/**
 * Pestañas del panel (Fase 3 de UI): subrayadas y desplazables, con una sombra en el borde
 * cuando hay más; en el celular, un `select`. Debajo va el contenido de la pestaña activa.
 * Con el teclado: flechas, Inicio y Fin (patrón de pestañas de WAI-ARIA).
 */
@Component({
  selector: 'pnl-pestanas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="pnl-pestanas__select">
      <span class="px-sr-only">{{ etiqueta() }}</span>
      <select (change)="activa.set($any($event.target).value)">
        @for (p of pestanas(); track p.clave) {
          <option [value]="p.clave" [selected]="activa() === p.clave">{{ p.texto }}</option>
        }
      </select>
    </label>
    <div class="pnl-pestanas" role="tablist" [attr.aria-label]="etiqueta()">
      @for (p of pestanas(); track p.clave; let i = $index) {
        <button
          type="button"
          role="tab"
          class="pnl-pestanas__pestana"
          [id]="id + '-' + p.clave"
          [attr.aria-selected]="activa() === p.clave"
          [attr.aria-controls]="id + '-panel'"
          [tabindex]="activa() === p.clave ? 0 : -1"
          (click)="activa.set(p.clave)"
          (keydown)="move($event, i)"
        >
          {{ p.texto }}
        </button>
      }
    </div>
    <div
      role="tabpanel"
      class="pnl-pestanas__panel"
      [id]="id + '-panel'"
      [attr.aria-labelledby]="id + '-' + activa()"
    >
      <ng-content />
    </div>
  `,
})
export class PestanasComponent {
  readonly pestanas = input.required<readonly Pestana[]>();
  readonly activa = model.required<string>();
  /** Qué agrupan (por ejemplo, *Secciones de la configuración*), para los lectores de pantalla. */
  readonly etiqueta = input('Secciones');

  protected readonly id = `pnl-pestanas-${++siguienteId}`;

  protected move(evento: KeyboardEvent, indice: number): void {
    const lista = this.pestanas();
    const destino =
      evento.key === 'ArrowRight'
        ? (indice + 1) % lista.length
        : evento.key === 'ArrowLeft'
          ? (indice - 1 + lista.length) % lista.length
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? lista.length - 1
              : null;
    if (destino === null) return;
    evento.preventDefault();
    const clave = lista[destino]?.clave;
    if (!clave) return;
    this.activa.set(clave);
    const pestanas = (evento.currentTarget as HTMLElement).parentElement?.children;
    (pestanas?.item(destino) as HTMLElement | null)?.focus();
  }
}
