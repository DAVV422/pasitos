import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Encabezado de cada pantalla del panel (Fase 3 de UI): el título, una línea que dice para qué
 * sirve y, a la derecha, la acción principal (un `pxBoton`) y las demás en
 * `<pnl-menu-acciones texto="Más">`. En el celular, las acciones bajan debajo del título.
 */
@Component({
  selector: 'pnl-encabezado-pagina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pnl-pagina' },
  template: `
    <div class="pnl-pagina__texto">
      <h1 class="pnl-pagina__titulo">{{ titulo() }}</h1>
      @if (descripcion()) {
        <p class="pnl-pagina__descripcion">{{ descripcion() }}</p>
      }
      <ng-content select="[pnlDetalle]" />
    </div>
    <div class="pnl-pagina__acciones">
      <ng-content />
    </div>
  `,
})
export class EncabezadoPaginaComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input<string | null>(null);
}
