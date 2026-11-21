import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { AvisoComponent, QrComponent } from '@pasitos/ui';
import { SalaApi, type FranjaRegistro } from '../sala-api.service';

/** Un poco después del cambio de franja, para que el servidor ya tenga la nueva. */
const MARGEN_MS = 300;

const MOTIVOS: Readonly<Record<string, string>> = {
  fuera_de_horario: 'El registro está fuera de horario.',
  tope_lleno: 'Llegamos al tope de cuentas de este QR.',
  autoregistro_apagado: 'El registro con QR está apagado.',
  evento_no_activo: 'El evento no está abierto.',
};

/**
 * La tablet en modo Registro (HU-319 §5): el QR que firma el servidor cada 30 s, *"Escanea para
 * entrar a [evento]"* y cuántas cuentas se crearon. La tablet no firma con su llave.
 */
@Component({
  selector: 'sala-registro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, QrComponent],
  template: `
    <section class="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 class="font-display text-4xl font-extrabold">Escanea para entrar a {{ evento() }}</h1>
      @if (franja(); as f) {
        @if (f.url) {
          <px-qr [texto]="f.url" [tamano]="tamano()" descripcion="QR para crear tu cuenta" />
          <p class="text-muted text-xl">Con la cámara del celular. No hace falta descargar nada.</p>
        } @else {
          <p class="text-2xl">{{ motivo(f.disponibilidad) }}</p>
        }
        <p class="font-display text-3xl font-extrabold" aria-live="polite" data-testid="cuentas">
          {{ f.registros }} {{ f.registros === 1 ? 'cuenta' : 'cuentas' }}
        </p>
      } @else if (sinRed()) {
        <px-aviso variante="advertencia">Sin conexión. Volvemos a intentar…</px-aviso>
      } @else {
        <p class="text-2xl">Cargando…</p>
      }
    </section>
  `,
})
export class RegistroComponent {
  readonly evento = input.required<string>();
  readonly tamano = input(400);

  private readonly api = inject(SalaApi);
  protected readonly franja = signal<FranjaRegistro | null>(null);
  protected readonly sinRed = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private activo = true;

  constructor() {
    void this.refresh();
    inject(DestroyRef).onDestroy(() => {
      this.activo = false;
      if (this.temporizador) clearTimeout(this.temporizador);
    });
  }

  protected motivo(disponibilidad: string): string {
    return MOTIVOS[disponibilidad] ?? 'Este QR ya no está activo.';
  }

  /** Pide la franja y el próximo pedido va justo después de que cambie. */
  private async refresh(): Promise<void> {
    if (!this.activo) return;
    let espera = 30_000;
    try {
      const franja = await this.api.getFranjaRegistro();
      this.franja.set(franja);
      this.sinRed.set(false);
      if (franja?.validoHasta) espera = franja.validoHasta - franja.horaServidor + MARGEN_MS;
    } catch {
      // Sin red el QR vence: mejor no mostrar uno viejo.
      this.franja.set(null);
      this.sinRed.set(true);
      espera = 5_000;
    }
    this.temporizador = setTimeout(() => void this.refresh(), Math.max(1_000, espera));
  }
}
