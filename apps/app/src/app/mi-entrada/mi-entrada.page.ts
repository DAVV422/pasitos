import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  AvisoComponent,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
  QrComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type MiEntrada } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';

const CADA_MS = 25_000;

/**
 * *Mi entrada* (HU-311 §1): el QR que cambia cada 30 s para la puerta o el stand, y el código de
 * asistente en grande para dictarlo si la cámara falla. Sin conexión, solo el código.
 */
@Component({
  selector: 'app-mi-entrada-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, ChipComponent, EstadoComponent, IconoComponent, QrComponent],
  template: `
    <h1 class="text-2xl font-extrabold">Mi entrada</h1>
    @if (entrada(); as e) {
      <section class="flex flex-col items-center gap-4 text-center">
        @if (!sinRed()) {
          <px-qr [texto]="e.qr" [tamano]="280" descripcion="QR de tu entrada" />
          <px-aviso variante="info">Sube el brillo para que lo lean mejor.</px-aviso>
        } @else {
          <px-aviso variante="advertencia">Sin conexión. Dicta tu código: {{ e.codigo }}</px-aviso>
        }
        <p class="font-display text-5xl font-extrabold tracking-wider" data-testid="codigo">
          {{ e.codigo }}
        </p>
        <p class="text-lg font-semibold">{{ e.nombre }}</p>
        <div class="flex flex-wrap justify-center gap-2">
          @for (grupo of e.grupos; track grupo) {
            <px-chip variante="puntos">{{ grupo }}</px-chip>
          }
          @if (e.ci.verificado) {
            <px-chip variante="ok"
              ><px-icono nombre="check" [tamano]="14" />Carnet verificado</px-chip
            >
          }
        </div>
        <p class="text-muted text-sm">Muéstralo en la puerta o en el stand de Pasitos.</p>
      </section>
    } @else if (error() !== null) {
      <px-estado tipo="error" titulo="No pudimos cargar tu entrada." [traceId]="error()" />
    } @else {
      <px-estado tipo="cargando" titulo="Cargando tu entrada…" />
    }
  `,
})
export class MiEntradaPage {
  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);
  private readonly cargada = signal<MiEntrada | null>(null);
  protected readonly sinRed = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Sin red, el código sale de la última copia del estado: un QR vencido no sirve. */
  protected readonly entrada = computed<MiEntrada | null>(() => {
    const cargada = this.cargada();
    if (cargada && !this.sinRed()) return cargada;
    const estado = this.sesion.estado();
    if (this.sinRed() && estado) {
      return {
        qr: '',
        codigo: estado.asistente.codigo,
        nombre: estado.asistente.nombre,
        validoHasta: '',
        grupos: estado.asistente.grupos,
        ci: estado.asistente.ci,
      };
    }
    return null;
  });

  constructor() {
    void this.load();
    // Mientras está a la vista: un QR nuevo cada 25 s (vale entre 30 y 60 s).
    const reloj = setInterval(() => {
      if (document.visibilityState === 'visible') void this.load();
    }, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') void this.load();
    };
    document.addEventListener('visibilitychange', alVolver);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    });
  }

  private async load(): Promise<void> {
    try {
      this.cargada.set(await this.api.getMiEntrada());
      this.sinRed.set(false);
      this.error.set(null);
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'SIN_CONEXION') {
        this.sinRed.set(true);
      } else if (!this.cargada()) {
        this.error.set(error instanceof ErrorApi ? (error.traceId ?? '') : '');
      }
    }
  }
}
