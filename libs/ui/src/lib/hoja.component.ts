import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/** Hoja inferior (bottom sheet) de los mockups. Usa `<dialog>` nativo: foco y Escape incluidos. */
@Component({
  selector: 'px-hoja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo class="px-hoja" [attr.aria-label]="etiqueta()" (close)="cerrada.emit()">
      <div class="px-hoja__asa" aria-hidden="true"></div>
      <ng-content />
    </dialog>
  `,
})
export class HojaComponent {
  readonly abierta = input(false);
  readonly etiqueta = input.required<string>();
  readonly cerrada = output<void>();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    effect(() => {
      const elemento = this.dialogo().nativeElement;
      if (this.abierta() && !elemento.open) elemento.showModal();
      if (!this.abierta() && elemento.open) elemento.close();
    });
  }
}

/** Diálogo centrado sobre `<dialog>` nativo (en los paneles se puede usar Angular CDK). */
@Component({
  selector: 'px-dialogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo class="px-dialogo" [attr.aria-label]="etiqueta()" (close)="cerrado.emit()">
      <ng-content />
    </dialog>
  `,
})
export class DialogoComponent {
  readonly abierto = input(false);
  readonly etiqueta = input.required<string>();
  readonly cerrado = output<void>();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    effect(() => {
      const elemento = this.dialogo().nativeElement;
      if (this.abierto() && !elemento.open) elemento.showModal();
      if (!this.abierto() && elemento.open) elemento.close();
    });
  }
}
