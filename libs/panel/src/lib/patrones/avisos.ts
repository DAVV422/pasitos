import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  Injectable,
  signal,
  viewChild,
} from '@angular/core';
import { AvisoComponent } from '@pasitos/ui';

export interface AvisoFlotante {
  readonly id: number;
  readonly variante: 'ok' | 'info';
  readonly texto: string;
}

/** Cuánto se ve un aviso flotante: lo bastante para leerlo, sin que se acumulen. */
export const DURACION_AVISO_MS = 4_000;

/**
 * Avisos flotantes del panel (toasts, Fase 3 de UI): *Guardado.*, *Quitamos a…*. Se van solos.
 * Los errores y los avisos de estado no van aquí: quedan fijos en la pantalla (`px-aviso`).
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private siguiente = 1;
  readonly lista = signal<readonly AvisoFlotante[]>([]);

  ok(texto: string, duracionMs = DURACION_AVISO_MS): void {
    this.show('ok', texto, duracionMs);
  }

  info(texto: string, duracionMs = DURACION_AVISO_MS): void {
    this.show('info', texto, duracionMs);
  }

  close(id: number): void {
    this.lista.update((lista) => lista.filter((a) => a.id !== id));
  }

  private show(variante: AvisoFlotante['variante'], texto: string, duracionMs: number): void {
    const id = this.siguiente++;
    // El mismo texto dos veces seguidas (guardar dos veces) no se apila: se reemplaza.
    this.lista.update((lista) => [
      ...lista.filter((a) => a.texto !== texto),
      { id, variante, texto },
    ]);
    setTimeout(() => this.close(id), duracionMs);
  }
}

/**
 * Dónde se muestran los avisos flotantes (va una vez, en `pnl-layout`). Usa un popover manual
 * para quedar encima de todo, también de un panel lateral o un diálogo abierto.
 */
@Component({
  selector: 'pnl-avisos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent],
  template: `
    <div #capa class="pnl-avisos" popover="manual" aria-live="polite">
      @for (aviso of avisos.lista(); track aviso.id) {
        <px-aviso class="pnl-avisos__aviso" [variante]="aviso.variante">
          {{ aviso.texto }}
          <button
            pxAvisoAccion
            type="button"
            class="pnl-avisos__cerrar"
            aria-label="Cerrar el aviso"
            (click)="avisos.close(aviso.id)"
          >
            ×
          </button>
        </px-aviso>
      }
    </div>
  `,
})
export class AvisosComponent {
  protected readonly avisos = inject(AvisosService);
  private readonly capa = viewChild.required<ElementRef<HTMLElement>>('capa');

  constructor() {
    let cuantos = 0;
    afterRenderEffect(() => {
      const capa = this.capa().nativeElement;
      const total = this.avisos.lista().length;
      const llego = total > cuantos;
      cuantos = total;
      if (typeof capa.showPopover !== 'function') return;
      // La capa queda abierta siempre (vacía no se ve ni recibe clics), así la región que se
      // anuncia no desaparece. Si llega un aviso con un diálogo abierto, se reabre para quedar
      // encima de él.
      const abierta = capa.matches(':popover-open');
      if (abierta && llego && document.querySelector('dialog[open]')) capa.hidePopover();
      if (!capa.matches(':popover-open')) capa.showPopover();
    });
  }
}
