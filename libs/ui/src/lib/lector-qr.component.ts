import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconoComponent } from './icono.component';

type EstadoLector = 'iniciando' | 'leyendo' | 'sin_permiso' | 'sin_camara';

interface DetectorNativo {
  detect(fuente: HTMLVideoElement): Promise<readonly { rawValue: string }[]>;
}

type Decodificar = (fuente: HTMLVideoElement) => Promise<string | null>;

const CADA_MS = 150;
/** El mismo QR no se vuelve a emitir hasta pasado este tiempo. */
const REPETIDO_MS = 2_500;

/**
 * El lector de QR con la cámara (Frontend §5, Rendimiento §4): primero el `BarcodeDetector` del
 * navegador; si falta (Safari, Firefox), `jsqr` se descarga **solo al abrir la cámara**. Emite
 * `leido` con el texto; quien lo usa decide qué hacer. Lo comparten la puerta (HU-301) y el
 * escáner del asistente (HU-310).
 */
@Component({
  selector: 'px-lector-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <div class="bg-text relative aspect-square w-full overflow-hidden rounded-xl">
      <video
        #video
        class="h-full w-full object-cover"
        playsinline
        muted
        aria-label="Vista de la cámara"
      ></video>
      @if (estado() === 'leyendo') {
        <div
          class="border-surface pointer-events-none absolute inset-[15%] rounded-xl border-4"
          aria-hidden="true"
        ></div>
      }
      @if (estado() !== 'leyendo') {
        <div
          class="bg-surface absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
          role="status"
        >
          @switch (estado()) {
            @case ('iniciando') {
              <px-icono nombre="scan" [tamano]="40" />
              <p>Abriendo la cámara…</p>
            }
            @case ('sin_permiso') {
              <px-icono nombre="camoff" [tamano]="40" />
              <p class="font-bold">Necesitamos la cámara para escanear</p>
              <p class="text-muted text-sm">
                Toca el candado junto a la dirección, activa Cámara y vuelve a intentar.
              </p>
            }
            @default {
              <px-icono nombre="camoff" [tamano]="40" />
              <p class="font-bold">No encontramos una cámara</p>
            }
          }
        </div>
      }
    </div>
  `,
})
export class LectorQrComponent {
  readonly leido = output<string>();

  protected readonly estado = signal<EstadoLector>('iniciando');
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private flujo: MediaStream | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private detenido = false;
  private ultimo = { texto: '', at: 0 };

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.estado.set('sin_camara');
      return;
    }
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (error) {
      const nombre = error instanceof DOMException ? error.name : '';
      this.estado.set(nombre === 'NotAllowedError' ? 'sin_permiso' : 'sin_camara');
      return;
    }
    if (this.detenido) {
      this.stop();
      return;
    }
    const video = this.video().nativeElement;
    video.srcObject = this.flujo;
    await video.play().catch(() => undefined);
    const decodificar = await getDecodificador();
    this.estado.set('leyendo');
    const vuelta = async () => {
      if (this.detenido) return;
      const texto = await decodificar(video).catch(() => null);
      if (texto) this.emit(texto);
      this.temporizador = setTimeout(() => void vuelta(), CADA_MS);
    };
    void vuelta();
  }

  private emit(texto: string): void {
    const ahora = Date.now();
    if (texto === this.ultimo.texto && ahora - this.ultimo.at < REPETIDO_MS) return;
    this.ultimo = { texto, at: ahora };
    this.leido.emit(texto);
  }

  private stop(): void {
    this.detenido = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    for (const pista of this.flujo?.getTracks() ?? []) pista.stop();
    this.flujo = null;
  }
}

/** El lector nativo si existe y lee QR; si no, `jsqr` (se descarga recién ahora). */
async function getDecodificador(): Promise<Decodificar> {
  const Nativo = (globalThis as { BarcodeDetector?: new (o: object) => DetectorNativo })
    .BarcodeDetector;
  if (Nativo) {
    try {
      const detector = new Nativo({ formats: ['qr_code'] });
      return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
    } catch {
      // Sin soporte para QR: se usa el respaldo.
    }
  }
  const { default: jsQR } = await import('jsqr');
  const lienzo = document.createElement('canvas');
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  return (video) => {
    if (!contexto || video.videoWidth === 0) return Promise.resolve(null);
    // Se achica: leer un cuadro de 480 px alcanza y cuesta mucho menos en un celular modesto.
    const escala = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    contexto.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
    return Promise.resolve(
      jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' })?.data ??
        null,
    );
  };
}
