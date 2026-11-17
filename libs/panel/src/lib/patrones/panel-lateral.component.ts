import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BotonDirective, IconoComponent } from '@pasitos/ui';

let siguienteId = 0;

/**
 * Formulario en un panel lateral (Fase 3 de UI): en escritorio se abre a la derecha, sobre la
 * lista (440 px); en el celular ocupa toda la pantalla. **Guardar / Cancelar** quedan fijos abajo:
 * no hace falta bajar hasta el final para guardar. Usa `<dialog>` nativo (foco y Escape).
 *
 *   <pnl-panel-lateral titulo="Nuevo reto" [abierto]="!!editando()" [guardando]="guardando()"
 *                      (guardar)="save($event)" (cerrado)="editando.set(null)">
 *     @if (editando()) { …campos, agrupados con <pnl-seccion>… }
 *   </pnl-panel-lateral>
 */
@Component({
  selector: 'pnl-panel-lateral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective, IconoComponent],
  template: `
    <dialog #dialogo class="pnl-panel" [attr.aria-labelledby]="id" (close)="cerrado.emit()">
      <form class="pnl-panel__form" novalidate (submit)="send($event)">
        <header class="pnl-panel__cabecera">
          <h2 class="pnl-panel__titulo" [id]="id">{{ titulo() }}</h2>
          <button type="button" class="pnl-panel__cerrar" aria-label="Cerrar" (click)="close()">
            <px-icono nombre="x" [tamano]="20" />
          </button>
        </header>
        <div class="pnl-panel__cuerpo">
          <ng-content />
        </div>
        <footer class="pnl-panel__pie">
          <button type="submit" pxBoton [cargando]="guardando()">{{ textoGuardar() }}</button>
          <button type="button" pxBoton="secundario" (click)="close()">Cancelar</button>
          <ng-content select="[pnlPie]" />
        </footer>
      </form>
    </dialog>
  `,
})
export class PanelLateralComponent {
  readonly titulo = input.required<string>();
  readonly abierto = input(false);
  readonly guardando = input(false);
  readonly textoGuardar = input('Guardar');
  /** El envío del formulario (ya con `preventDefault`). */
  readonly guardar = output<SubmitEvent>();
  /** Cancelar, la ×, Escape o `abierto` en false. */
  readonly cerrado = output<void>();

  protected readonly id = `pnl-panel-${++siguienteId}`;
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    effect(() => {
      const elemento = this.dialogo().nativeElement;
      if (typeof elemento.showModal !== 'function') return;
      if (this.abierto() && !elemento.open) {
        elemento.showModal();
        // El foco va al primer campo (no a la ×): se puede escribir apenas se abre. Al cerrar,
        // el navegador lo devuelve al botón que lo abrió.
        setTimeout(() => this.focusPrimerCampo());
      }
      if (!this.abierto() && elemento.open) elemento.close();
    });
  }

  private focusPrimerCampo(): void {
    const cuerpo = this.dialogo().nativeElement.querySelector('.pnl-panel__cuerpo');
    cuerpo
      ?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea')
      ?.focus();
  }

  protected send(evento: SubmitEvent): void {
    evento.preventDefault();
    this.guardar.emit(evento);
  }

  protected close(): void {
    this.dialogo().nativeElement.close();
  }
}

/**
 * Sección con título dentro de un formulario largo (*Básico*, *Cuándo*, *Avanzado*). Con
 * `plegable`, empieza cerrada (salvo `abierta`, por ejemplo si hay un error adentro).
 */
@Component({
  selector: 'pnl-seccion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #contenido><ng-content /></ng-template>
    @if (plegable()) {
      <details class="pnl-seccion" [open]="abierta()">
        <summary class="pnl-seccion__titulo">{{ titulo() }}</summary>
        <div class="pnl-seccion__cuerpo"><ng-container [ngTemplateOutlet]="contenido" /></div>
      </details>
    } @else {
      <section class="pnl-seccion" [attr.aria-labelledby]="id">
        <h3 class="pnl-seccion__titulo" [id]="id">{{ titulo() }}</h3>
        <div class="pnl-seccion__cuerpo"><ng-container [ngTemplateOutlet]="contenido" /></div>
      </section>
    }
  `,
})
export class SeccionComponent {
  readonly titulo = input.required<string>();
  readonly plegable = input(false);
  readonly abierta = input(false);

  protected readonly id = `pnl-seccion-${++siguienteId}`;
}
