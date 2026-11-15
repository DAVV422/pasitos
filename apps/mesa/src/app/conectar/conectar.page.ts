import { ChangeDetectionStrategy, Component, inject, input, type OnInit } from '@angular/core';
import { AvisoComponent, EstadoComponent } from '@pasitos/ui';
import { isNavegadorDeOtraApp, TerminalService } from '@pasitos/web-core';

/** Conectar la mesa de canje (HU-209 §4). El cobro llega en la fase 3. */
@Component({
  selector: 'mesa-conectar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, EstadoComponent],
  template: `
    <h1 class="text-3xl font-extrabold">Mesa de canje</h1>
    @if (otraApp) {
      <px-aviso variante="advertencia">Ábrelo en Chrome o Safari.</px-aviso>
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
          Esta mesa no está conectada. Pide al organizador el QR o el enlace para conectarla.
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

  ngOnInit(): void {
    const token = this.token();
    if (token) {
      void this.terminal.connect(token).then(() => {
        // El token ya se usó: que recargar no lo vuelva a mandar.
        history.replaceState(null, '', document.baseURI);
      });
    } else {
      void this.terminal.check();
    }
  }
}
