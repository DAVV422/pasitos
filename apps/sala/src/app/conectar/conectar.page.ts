import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { AvisoComponent, BotonDirective, EstadoComponent } from '@pasitos/ui';
import { isNavegadorDeOtraApp, TerminalService } from '@pasitos/web-core';
import { getLlavePublica } from './llave-local';

/** Conectar la pantalla de sala (HU-209 §4, mockup M2). El QR del reto llega en la fase 3. */
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
            @if (!completa()) {
              <button type="button" pxBoton (click)="setPantallaCompleta()">
                Pantalla completa y mantener encendida
              </button>
            } @else {
              <px-aviso variante="ok">Pantalla completa y encendida.</px-aviso>
            }
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
  protected readonly completa = signal(false);
  private candado: WakeLockSentinel | null = null;

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
      void this.terminal.check();
    }
  }

  /** Un toque: pantalla completa y *Mantener la pantalla encendida* (el QR llega en la fase 3). */
  protected async setPantallaCompleta(): Promise<void> {
    try {
      await document.documentElement.requestFullscreen();
      this.candado = await navigator.wakeLock.request('screen');
    } catch {
      // Sin permiso para alguna de las dos: la pantalla sigue funcionando igual.
    }
    this.completa.set(this.candado !== null || document.fullscreenElement !== null);
  }
}
