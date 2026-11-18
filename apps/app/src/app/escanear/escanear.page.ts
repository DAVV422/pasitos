import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { AvisoComponent, LectorQrComponent } from '@pasitos/ui';
import { SesionAsistente } from '../sesion-asistente';
import { isQrReto, ReclamoService } from './reclamo.service';
import { ResultadoReclamoComponent } from './resultado-reclamo.component';

/**
 * *Escanear* (HU-310 §2, mockups A6, A7, A3, A8 y A16): la cámara trasera con el lector nativo o
 * el de respaldo (que se descarga recién al abrirla), y el reclamo firmado.
 */
@Component({
  selector: 'app-escanear-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, LectorQrComponent, ResultadoReclamoComponent],
  template: `
    <h1 class="text-2xl font-extrabold">Escanear</h1>
    @if (motivo(); as m) {
      <px-aviso variante="advertencia">{{ m }}</px-aviso>
    } @else if (reclamos.resultado()) {
      <app-resultado-reclamo (otro)="reset()" />
    } @else {
      @defer (on immediate) {
        <px-lector-qr (leido)="onLeido($event)" />
      } @placeholder {
        <p class="text-muted">Abriendo la cámara…</p>
      }
      <p class="text-muted text-center">Apunta al QR de la pantalla de la sala o del stand.</p>
      @if (ajeno()) {
        <px-aviso variante="advertencia">Este código no es de Pasitos.</px-aviso>
      }
    }
  `,
})
export class EscanearPage {
  protected readonly reclamos = inject(ReclamoService);
  private readonly sesion = inject(SesionAsistente);
  protected readonly ajeno = signal(false);
  private quitarAjeno: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.reclamos.reset();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.quitarAjeno));
  }

  /** Sin red, pausado, cerrado o antes del inicio: lo dice en vez de fallar al escanear. */
  protected motivo(): string | null {
    const estado = this.sesion.estado()?.evento.estado;
    if (this.sesion.sinConexion()) return 'Necesitas conexión para escanear.';
    if (estado === 'pausado') return 'Pausamos un momento. Tus puntos están seguros.';
    if (estado === 'cerrado') return 'El evento terminó.';
    if (estado !== 'en_curso') return 'El evento todavía no empezó.';
    return null;
  }

  protected onLeido(texto: string): void {
    if (!isQrReto(texto)) {
      this.ajeno.set(true);
      clearTimeout(this.quitarAjeno);
      this.quitarAjeno = setTimeout(() => this.ajeno.set(false), 3_000);
      return;
    }
    this.ajeno.set(false);
    void this.reclamos.claim(texto);
  }

  protected reset(): void {
    this.reclamos.reset();
  }
}
