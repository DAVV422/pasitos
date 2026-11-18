import { ChangeDetectionStrategy, Component, inject, input, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AvisoComponent, BotonDirective, EstadoComponent } from '@pasitos/ui';
import { isNavegadorDeOtraApp, TerminalService } from '@pasitos/web-core';
import { getLlavePublica } from './llave-local';

/** Conectar la pantalla de sala (HU-209 §4, mockup M2); después, el QR del reto (HU-314). */
@Component({
  selector: 'sala-conectar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent],
  template: `
    <h1 class="text-3xl font-extrabold">Pantalla de sala</h1>
    @if (otraApp) {
      <px-aviso variante="advertencia">
        Ábrelo en Chrome o Safari: dentro de otra app la pantalla no guarda su llave.
      </px-aviso>
    }
    @switch (terminal.estado()) {
      @case ('revisando') {
        <px-estado tipo="cargando" />
      }
      @case ('conectando') {
        <px-estado tipo="cargando" titulo="Conectando…" />
      }
      @case ('sin_conectar') {
        <p class="text-muted">
          Esta pantalla no está conectada. Pide al organizador el QR o el enlace para conectarla.
        </p>
      }
      @case ('error') {
        <px-aviso variante="peligro">{{ terminal.mensaje() }}</px-aviso>
      }
      @case ('conectada') {
        @if (terminal.terminal(); as t) {
          <section class="flex flex-col gap-3" aria-live="polite">
            <p class="font-display text-2xl font-extrabold">Conectada</p>
            <p>
              <b>{{ t.nombre }}</b>
              @if (t.lugar) {
                · {{ t.lugar }}
              }
            </p>
            <p class="text-muted">{{ t.evento.nombre }}</p>
            <button type="button" pxBoton (click)="start()">
              Empezar: pantalla completa y encendida
            </button>
          </section>
        }
      }
    }
  `,
})
export class ConectarPage implements OnInit {
  readonly token = input<string>();
  protected readonly terminal = inject(TerminalService);
  protected readonly otraApp = isNavegadorDeOtraApp(navigator.userAgent);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const token = this.token();
    if (token) {
      void getLlavePublica()
        .then((llave) => this.terminal.connect(token, llave))
        .then(() => {
          // El token ya se usó: que recargar no lo vuelva a mandar.
          history.replaceState(null, '', document.baseURI);
        });
    } else {
      // Ya estaba conectada (se recargó o se volvió a abrir): directo al QR.
      void this.terminal.check().then(() => {
        if (this.terminal.estado() === 'conectada') void this.router.navigate(['/pantalla']);
      });
    }
  }

  /** Un toque: pantalla completa (necesita el gesto) y el QR del reto (HU-314). */
  protected async start(): Promise<void> {
    await document.documentElement.requestFullscreen().catch(() => undefined);
    await this.router.navigate(['/pantalla']);
  }
}
