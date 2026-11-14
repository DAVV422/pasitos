import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconoComponent } from './icono.component';

/**
 * Estado de una pantalla (Frontend §5.1): cargando, vacío o error.
 * En error muestra el código de soporte (primeros 8 caracteres del traceId).
 */
@Component({
  selector: 'px-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  host: { '[attr.aria-busy]': 'tipo() === "cargando" || null' },
  template: `
    @switch (tipo()) {
      @case ('cargando') {
        <div class="px-estado" role="status">
          <div class="px-esqueleto" style="width: 100%; height: 72px"></div>
          <div class="px-esqueleto" style="width: 70%; height: 20px"></div>
          <span class="px-sr-only">Cargando…</span>
        </div>
      }
      @case ('vacio') {
        <div class="px-estado">
          <px-icono nombre="info" [tamano]="40" />
          <h2 class="px-estado__titulo">{{ titulo() }}</h2>
          <ng-content />
        </div>
      }
      @case ('error') {
        <div class="px-estado" role="alert">
          <px-icono nombre="alert" [tamano]="40" />
          <h2 class="px-estado__titulo">{{ titulo() }}</h2>
          <ng-content />
          @if (codigoSoporte(); as codigo) {
            <span
              >Código de soporte: <span class="px-codigo">{{ codigo }}</span></span
            >
          }
        </div>
      }
    }
  `,
})
export class EstadoComponent {
  readonly tipo = input.required<'cargando' | 'vacio' | 'error'>();
  readonly titulo = input('');
  readonly traceId = input<string | null>(null);

  protected readonly codigoSoporte = computed(() => this.traceId()?.slice(0, 8) ?? null);
}
