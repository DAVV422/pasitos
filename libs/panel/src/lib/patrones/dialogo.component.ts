import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { IconoComponent } from '@pasitos/ui';

let siguienteId = 0;

/**
 * Diálogo centrado (Fase 4 de UI) para mostrar algo y volver a la lista: *Conectar* una pantalla
 * con su QR, *Ver enlace* de un invitado. Usa `<dialog>` nativo (foco, Escape y fondo inerte).
 * Las acciones van en `[pnlPie]`; la × siempre cierra.
 *
 *   <pnl-dialogo titulo="Conectar Tablet Auditorio" [abierto]="!!conectando()"
 *                (cerrado)="conectando.set(null)">
 *     …el QR…
 *     <button pnlPie pxBoton="secundario" (click)="conectando.set(null)">Listo</button>
 *   </pnl-dialogo>
 */
@Component({
  selector: 'pnl-dialogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  // Escape ya cierra con el teclado; el clic en el fondo es un atajo más del mouse.
  host: { '(click)': 'onClick($event)' },
  template: `
    <dialog #dialogo class="pnl-dialogo" [attr.aria-labelledby]="id" (close)="cerrado.emit()">
      <header class="pnl-panel__cabecera">
        <h2 class="pnl-panel__titulo" [id]="id">{{ titulo() }}</h2>
        <button type="button" class="pnl-panel__cerrar" aria-label="Cerrar" (click)="close()">
          <px-icono nombre="x" [tamano]="20" />
        </button>
      </header>
      <div class="pnl-dialogo__cuerpo"><ng-content /></div>
      <footer class="pnl-dialogo__pie"><ng-content select="[pnlPie]" /></footer>
    </dialog>
  `,
})
export class DialogoComponent {
  readonly titulo = input.required<string>();
  readonly abierto = input(false);
  /** La ×, Escape, un clic en el fondo o `abierto` en false. */
  readonly cerrado = output<void>();

  protected readonly id = `pnl-dialogo-${++siguienteId}`;
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    effect(() => {
      const elemento = this.dialogo().nativeElement;
      if (typeof elemento.showModal !== 'function') return;
      if (this.abierto() && !elemento.open) elemento.showModal();
      if (!this.abierto() && elemento.open) elemento.close();
    });
  }

  /** Un clic en el fondo (fuera del cuadro) cierra, como en los diálogos de siempre. */
  protected onClick(evento: MouseEvent): void {
    if (evento.target === this.dialogo().nativeElement) this.close();
  }

  protected close(): void {
    const elemento = this.dialogo().nativeElement;
    if (typeof elemento.close === 'function' && elemento.open) elemento.close();
    else this.cerrado.emit();
  }
}
