import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { IconoComponent } from '@pasitos/ui';

let siguienteId = 0;

/**
 * Menú de acciones (Fase 3 de UI): **Más ▾** en el encabezado de una página o **⋯** en una fila.
 * Las acciones son `<button type="button">` (o `<a>`) proyectados; al elegir una, el menú se
 * cierra. Usa la API de popover: se cierra con Escape o al tocar afuera. Es un botón que
 * despliega (no un `role=menu`): las acciones siguen siendo botones comunes, con flechas para moverse.
 *
 *   <pnl-menu-acciones texto="Más">
 *     <button type="button" (click)="exportar()">Exportar</button>
 *   </pnl-menu-acciones>
 */
@Component({
  selector: 'pnl-menu-acciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  host: { class: 'pnl-acciones' },
  template: `
    <button
      #disparador
      type="button"
      [class]="texto() ? 'px-boton px-boton--secundario' : 'pnl-acciones__puntos'"
      [attr.popovertarget]="id"
      [attr.aria-expanded]="abierto()"
      [attr.aria-label]="etiqueta() || null"
    >
      @if (texto()) {
        {{ texto() }}
        <px-icono nombre="abajo" [tamano]="18" />
      } @else {
        <px-icono nombre="puntos" [tamano]="20" />
      }
    </button>
    <div
      #panel
      class="pnl-acciones__panel"
      popover="auto"
      tabindex="-1"
      [id]="id"
      (toggle)="onToggle($event)"
      (click)="onClick($event)"
      (keydown)="move($event)"
    >
      <ng-content />
    </div>
  `,
})
export class MenuAccionesComponent {
  /** Texto del botón (*Más*). Sin texto se dibuja **⋯** y `etiqueta` es obligatoria. */
  readonly texto = input<string | null>(null);
  /** Nombre para los lectores de pantalla, por ejemplo *Acciones de Taza Pasitos*. */
  readonly etiqueta = input<string | null>(null);

  protected readonly id = `pnl-acciones-${++siguienteId}`;
  protected readonly abierto = signal(false);
  private readonly disparador = viewChild.required<ElementRef<HTMLButtonElement>>('disparador');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected onToggle(evento: Event): void {
    const abierto = (evento as ToggleEvent).newState === 'open';
    this.abierto.set(abierto);
    if (!abierto) return;
    this.place();
    this.items()[0]?.focus();
  }

  protected onClick(evento: MouseEvent): void {
    const item = (evento.target as HTMLElement).closest('button, a');
    const panel = this.panel().nativeElement;
    if (item && !item.hasAttribute('disabled') && panel.matches(':popover-open')) {
      panel.hidePopover();
    }
  }

  protected move(evento: KeyboardEvent): void {
    const items = this.items();
    const actual = items.indexOf(document.activeElement as HTMLElement);
    const destino =
      evento.key === 'ArrowDown'
        ? (actual + 1) % items.length
        : evento.key === 'ArrowUp'
          ? (actual - 1 + items.length) % items.length
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? items.length - 1
              : null;
    if (destino === null) return;
    evento.preventDefault();
    items[destino]?.focus();
  }

  private items(): HTMLElement[] {
    const panel = this.panel().nativeElement;
    return [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
  }

  /** Debajo del botón, alineado a su derecha; arriba si no entra. */
  private place(): void {
    const boton = this.disparador().nativeElement.getBoundingClientRect();
    const panel = this.panel().nativeElement;
    const alto = panel.offsetHeight;
    const ancho = panel.offsetWidth;
    const abajo = boton.bottom + 4 + alto <= window.innerHeight;
    const top = abajo ? boton.bottom + 4 : Math.max(8, boton.top - 4 - alto);
    const left = Math.min(Math.max(8, boton.right - ancho), window.innerWidth - ancho - 8);
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }
}
