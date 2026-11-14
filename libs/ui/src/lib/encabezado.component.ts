import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { TipoEvento } from '@pasitos/dominio';
import { ChipComponent } from './chip.component';
import { IconoComponent } from './icono.component';

/**
 * Encabezado de pantalla: logo (o "Volver"), título opcional y chips TESTNET y, en eventos
 * demo, DEMO (T-010 §4).
 */
@Component({
  selector: 'px-encabezado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, IconoComponent],
  host: { class: 'px-encabezado', role: 'banner' },
  template: `
    @if (volverA(); as destino) {
      <button type="button" class="px-encabezado__volver" (click)="volver.emit()">
        <px-icono nombre="back" />{{ destino }}
      </button>
    } @else {
      <span class="px-encabezado__marca">
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <svg:path
            d="M13 11 L32 32 L13 53"
            fill="none"
            stroke="var(--logo-amarillo)"
            stroke-width="9"
          />
          <svg:path
            d="M32 11 L51 32 L32 53"
            fill="none"
            stroke="var(--logo-naranja)"
            stroke-width="9"
          />
        </svg>
        <b>{{ titulo() }}</b>
      </span>
    }
    <span class="px-encabezado__chips">
      @if (esDemo()) {
        <px-chip variante="puntos">Demo</px-chip>
      }
      <px-chip variante="testnet">Testnet</px-chip>
    </span>
  `,
})
export class EncabezadoComponent {
  readonly titulo = input('Pasitos');
  /** Texto del botón para volver (por ejemplo, "Puerta"). Si no hay, se muestra el logo. */
  readonly volverA = input<string | null>(null);
  readonly tipoEvento = input<TipoEvento | null>(null);
  readonly volver = output<void>();

  protected readonly esDemo = computed(() => this.tipoEvento() === 'demo');
}
