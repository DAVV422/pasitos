import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { EstadoComponent } from '@pasitos/ui';
import { SesionAsistente } from '../sesion-asistente';
import { CLAVE_QR_PENDIENTE } from './qr-pendiente';
import { isQrReto, ReclamoService } from './reclamo.service';
import { ResultadoReclamoComponent } from './resultado-reclamo.component';

/**
 * `/r/:qr` (HU-310 §3): el QR de reto abierto con la cámara del sistema. Con la entrada en este
 * navegador, lo reclama; si no, pide abrir Pasitos donde se registró, sin perder el QR.
 */
@Component({
  selector: 'app-qr-directo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, ResultadoReclamoComponent],
  template: `
    @switch (paso()) {
      @case ('revisando') {
        <px-estado tipo="cargando" titulo="Verificando…" />
      }
      @case ('sin_entrada') {
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl font-extrabold">Abre Pasitos en el navegador donde te registraste</h1>
          <p>
            Este navegador no tiene tu entrada. Abre Pasitos en el mismo navegador donde la
            activaste y escanea el QR desde ahí.
          </p>
        </section>
      }
      @case ('ajeno') {
        <p class="text-lg">Este código no es de Pasitos.</p>
      }
      @default {
        <app-resultado-reclamo (otro)="scanOtro()" />
      }
    }
  `,
})
export class QrDirectoPage implements OnInit {
  readonly qr = input<string>('');
  private readonly sesion = inject(SesionAsistente);
  private readonly reclamos = inject(ReclamoService);
  private readonly router = inject(Router);
  protected readonly paso = signal<'revisando' | 'sin_entrada' | 'ajeno' | 'reclamo'>('revisando');

  async ngOnInit(): Promise<void> {
    const qr = this.qr();
    if (!isQrReto(qr)) {
      this.paso.set('ajeno');
      return;
    }
    this.reclamos.reset();
    const resultado = this.sesion.estado()
      ? 'ok'
      : await this.sesion.load().catch(() => 'error' as const);
    if (resultado !== 'ok') {
      try {
        sessionStorage.setItem(CLAVE_QR_PENDIENTE, qr);
      } catch {
        // Sin almacenamiento: el QR se vuelve a escanear.
      }
      this.paso.set('sin_entrada');
      return;
    }
    this.sesion.start();
    this.paso.set('reclamo');
    await this.reclamos.claim(qr);
  }

  protected scanOtro(): void {
    void this.router.navigate(['/escanear']);
  }
}
