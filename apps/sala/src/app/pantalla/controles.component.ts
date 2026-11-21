import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AvisoComponent, BotonDirective, IconoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { SalaApi, type AccionPantalla } from '../sala-api.service';

const CIERRE_MS = 30_000;
const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

/**
 * Los controles de la tablet (HU-315 §3): un botón discreto en una esquina, el PIN y cuatro
 * botones grandes. Se cierran solos a los 30 s sin uso.
 */
@Component({
  selector: 'sala-controles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, IconoComponent],
  host: { '(click)': '$event.stopPropagation()' },
  template: `
    @if (!abierto()) {
      <button
        type="button"
        class="text-muted hover:bg-surface2 focus-visible:opacity-100 absolute right-3 bottom-3 flex h-12 w-12 items-center justify-center rounded-full opacity-50 transition-opacity hover:opacity-100"
        aria-label="Controles de la pantalla"
        (click)="open()"
      >
        <px-icono nombre="lock" [tamano]="20" />
      </button>
    } @else {
      <div
        class="bg-bg absolute inset-0 z-30 flex items-center justify-center p-6"
        role="dialog"
        aria-label="Controles de la pantalla"
        (pointerdown)="touch()"
      >
        <div class="flex w-full max-w-md flex-col gap-4">
          @if (pin() === null) {
            <h2 class="text-center text-2xl font-extrabold">PIN de los controles</h2>
            <p class="font-display text-center text-4xl tracking-[0.5em]" aria-live="polite">
              {{ puntos() }}
            </p>
            <div class="grid grid-cols-3 gap-3">
              @for (d of digitos; track $index) {
                @if (d === '') {
                  <span></span>
                } @else {
                  <button
                    pxBoton="secundario"
                    type="button"
                    class="h-16 text-2xl"
                    [attr.aria-label]="d === '⌫' ? 'Borrar' : d"
                    (click)="press(d)"
                  >
                    {{ d }}
                  </button>
                }
              }
            </div>
          } @else {
            <h2 class="text-center text-2xl font-extrabold">Controles</h2>
            <button
              pxBoton
              type="button"
              class="h-16 text-xl"
              [cargando]="enviando()"
              (click)="run('generar_otro')"
            >
              <px-icono nombre="refresh" [tamano]="22" />Generar otro ahora
            </button>
            @if (pausada()) {
              <button
                pxBoton
                type="button"
                class="h-16 text-xl"
                [cargando]="enviando()"
                (click)="run('reanudar')"
              >
                Reanudar
              </button>
            } @else {
              <button
                pxBoton="secundario"
                type="button"
                class="h-16 text-xl"
                [cargando]="enviando()"
                (click)="run('pausar')"
              >
                Pausar
              </button>
            }
            @if (opciones().length > 0 || fijado()) {
              <label class="flex flex-col gap-2 text-lg font-semibold">
                Cambiar de reto
                <select class="px-control h-14" (change)="changeReto($any($event.target).value)">
                  <option value="">Según la agenda</option>
                  @for (o of opciones(); track o.id) {
                    <option [value]="o.id" [selected]="o.id === retoActual()">
                      {{ o.nombre }}
                    </option>
                  }
                </select>
              </label>
            }
          }
          @if (error(); as e) {
            <px-aviso variante="peligro">{{ e }}</px-aviso>
          }
          <button pxBoton="secundario" type="button" (click)="close()">Cerrar</button>
        </div>
      </div>
    }
  `,
})
export class ControlesComponent {
  private readonly api = inject(SalaApi);

  readonly pausada = input(false);
  readonly fijado = input(false);
  readonly retoActual = input<string | null>(null);
  readonly opciones = input<readonly { id: string; nombre: string }[]>([]);
  /** Antes de que el servidor confirme: la pausa esconde el QR al instante. */
  readonly optimista = output<'pausada' | 'activa' | null>();
  /** El servidor confirmó: hay que volver a pedir el estado. */
  readonly cambio = output<void>();

  protected readonly abierto = signal(false);
  protected readonly entrada = signal('');
  protected readonly pin = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly digitos = DIGITOS;
  private cierre: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.cierre));
  }

  protected puntos(): string {
    return '•'.repeat(this.entrada().length).padEnd(4, '–');
  }

  protected open(): void {
    this.abierto.set(true);
    this.touch();
  }

  protected close(): void {
    clearTimeout(this.cierre);
    this.abierto.set(false);
    this.entrada.set('');
    this.pin.set(null);
    this.error.set(null);
  }

  /** Cualquier toque reinicia los 30 s. */
  protected touch(): void {
    clearTimeout(this.cierre);
    this.cierre = setTimeout(() => this.close(), CIERRE_MS);
  }

  protected press(digito: string): void {
    this.error.set(null);
    if (digito === '⌫') {
      this.entrada.set(this.entrada().slice(0, -1));
      return;
    }
    const valor = (this.entrada() + digito).slice(0, 4);
    this.entrada.set(valor);
    // Se confirma con la primera acción: el servidor revisa el PIN cada vez.
    if (valor.length === 4) this.pin.set(valor);
  }

  protected changeReto(retoId: string): void {
    void this.run('cambiar_reto', retoId || null);
  }

  protected async run(accion: AccionPantalla, retoId?: string | null): Promise<void> {
    const pin = this.pin();
    if (!pin || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    if (accion === 'pausar') this.optimista.emit('pausada');
    try {
      await this.api.control(accion, pin, retoId);
      this.cambio.emit();
      this.close();
    } catch (error) {
      if (accion === 'pausar') this.optimista.emit(null);
      if (error instanceof ErrorApi && error.code === 'PIN_INVALIDO') {
        this.pin.set(null);
        this.entrada.set('');
      }
      this.error.set(
        error instanceof ErrorApi
          ? error.detail
          : 'No pudimos aplicar el cambio. Intenta de nuevo.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
