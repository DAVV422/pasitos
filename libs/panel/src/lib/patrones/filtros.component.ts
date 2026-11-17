import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IconoComponent } from '@pasitos/ui';

/**
 * Barra de filtros de una lista (Fase 3 de UI): el buscador ancho (`[pnlBuscador]`) y los
 * filtros a su lado. En el celular, los filtros se esconden tras un botón **Filtros** que dice
 * cuántos hay activos.
 *
 *   <pnl-filtros [activos]="cuantosFiltros()">
 *     <input pnlBuscador type="search" aria-label="Buscar" />
 *     <select aria-label="Estado">…</select>
 *   </pnl-filtros>
 */
@Component({
  selector: 'pnl-filtros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  host: { class: 'pnl-filtros', '[class.pnl-filtros--abiertos]': 'abiertos()' },
  template: `
    <div class="pnl-filtros__buscador"><ng-content select="[pnlBuscador]" /></div>
    <button
      type="button"
      class="pnl-filtros__boton px-boton px-boton--secundario"
      [attr.aria-expanded]="abiertos()"
      (click)="abiertos.set(!abiertos())"
    >
      <px-icono nombre="filtro" [tamano]="18" />
      Filtros{{ activos() ? ' (' + activos() + ')' : '' }}
    </button>
    <div class="pnl-filtros__resto"><ng-content /></div>
  `,
})
export class FiltrosComponent {
  /** Cuántos filtros están aplicados (para el botón del celular). */
  readonly activos = input(0);
  protected readonly abiertos = signal(false);
}
