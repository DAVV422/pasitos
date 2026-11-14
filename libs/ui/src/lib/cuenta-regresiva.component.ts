import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ChipComponent } from './chip.component';
import { IconoComponent } from './icono.component';

/** Formatea segundos como m:ss. */
export function formatCuentaRegresiva(segundos: number): string {
  const restantes = Math.max(0, Math.ceil(segundos));
  const minutos = Math.floor(restantes / 60);
  return `${minutos}:${String(restantes % 60).padStart(2, '0')}`;
}

/**
 * Cuenta regresiva hasta `hasta`. Anuncia a los lectores de pantalla al llegar a 30 s y a 0,
 * no cada segundo. Emite `vencio` una sola vez.
 */
@Component({
  selector: 'px-cuenta-regresiva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, IconoComponent],
  template: `
    <px-chip variante="puntos"
      ><px-icono nombre="clock" [tamano]="14" />Vence en {{ texto() }}</px-chip
    >
    <span class="px-sr-only" aria-live="polite">{{ anuncio() }}</span>
  `,
})
export class CuentaRegresivaComponent {
  readonly hasta = input.required<Date>();
  readonly vencio = output<void>();

  private readonly ahora = signal(Date.now());
  private avisado = false;

  protected readonly segundos = computed(() => (this.hasta().getTime() - this.ahora()) / 1000);
  protected readonly texto = computed(() => formatCuentaRegresiva(this.segundos()));
  protected readonly anuncio = computed(() => {
    const segundos = this.segundos();
    if (segundos <= 0) return 'El tiempo terminó';
    if (segundos <= 30) return 'Quedan menos de 30 segundos';
    return '';
  });

  constructor() {
    const reloj = setInterval(() => {
      this.ahora.set(Date.now());
      if (this.segundos() <= 0 && !this.avisado) {
        this.avisado = true;
        this.vencio.emit();
        clearInterval(reloj);
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}
