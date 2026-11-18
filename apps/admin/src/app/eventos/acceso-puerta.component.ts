import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  CuentaRegresivaComponent,
  IconoComponent,
  QrComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { PuertaApi, type AccesoGenerado, type FichaPuerta } from './puerta-api.service';

/** Lo que trae el aviso en vivo `acceso.vinculado`. */
export interface AvisoVinculado {
  readonly accesoId: string;
  readonly modelo: string;
  readonly hora: string;
}

type Paso = 'generando' | 'motivo' | 'mostrando' | 'vencido' | 'vinculado' | 'error';

const SONDEO_MS = 3_000;

/**
 * El QR de asistente en la puerta (HU-302 §3, mockups PU5 y PU6): el QR grande, el enlace corto
 * para escribirlo y la cuenta regresiva de 2:00. Al vincularse (aviso en vivo o, si falla, un
 * pedido cada 3 s) muestra **Vinculado ✓** con el modelo.
 */
@Component({
  selector: 'adm-acceso-puerta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    CuentaRegresivaComponent,
    IconoComponent,
    QrComponent,
  ],
  template: `
    <section class="border-line bg-surface flex flex-col items-center gap-4 rounded-xl border p-5">
      <h2 class="text-xl font-bold">QR de asistente · {{ ficha().nombre }}</h2>
      @switch (paso()) {
        @case ('generando') {
          <p class="text-muted">Generando…</p>
        }
        @case ('motivo') {
          <p>
            {{ ficha().nombre }} ya tiene un celular vinculado. Al vincular otro, el anterior deja
            de funcionar.
          </p>
          <px-campo #campo="pxCampo" etiqueta="Motivo" ayuda="Por ejemplo: cambió de celular.">
            <input
              [id]="campo.idControl"
              [attr.aria-describedby]="campo.idDescripcion"
              maxlength="300"
              [value]="motivo()"
              (input)="motivo.set($any($event.target).value)"
            />
          </px-campo>
          <button
            pxBoton
            type="button"
            [deshabilitado]="motivo().trim().length < 5"
            (click)="generate()"
          >
            Generar el QR
          </button>
        }
        @case ('mostrando') {
          @if (acceso(); as a) {
            <px-qr [texto]="a.qr" [tamano]="280" descripcion="QR de asistente" />
            <p class="text-center">Pídele que lo escanee con la cámara del celular.</p>
            <p class="text-muted text-sm">O que escriba en el navegador:</p>
            <p
              class="font-display text-center text-2xl font-extrabold break-all"
              data-testid="enlace-corto"
            >
              {{ sinProtocolo(a.enlaceCorto) }}
            </p>
            <px-cuenta-regresiva [hasta]="expira(a)" (vencio)="paso.set('vencido')" />
            <p class="text-muted text-sm">Sube el brillo de esta pantalla para que se lea mejor.</p>
          }
        }
        @case ('vencido') {
          <px-aviso variante="advertencia">El QR venció.</px-aviso>
          <button pxBoton type="button" (click)="generate()">
            <px-icono nombre="refresh" [tamano]="18" />Generar otro
          </button>
        }
        @case ('vinculado') {
          @if (vinculado(); as v) {
            <p class="text-success flex items-center gap-2 text-2xl font-extrabold" role="status">
              <px-icono nombre="check" [tamano]="28" />Vinculado ✓
            </p>
            <p class="text-lg">{{ v.modelo }} · {{ v.hora }}</p>
            <px-aviso variante="info"
              >Compara: su celular debe decir <b>«Hola, {{ primerNombre() }}»</b>.</px-aviso
            >
          }
        }
        @case ('error') {
          <px-aviso variante="peligro">{{ error() }}</px-aviso>
        }
      }
      <button pxBoton="secundario" type="button" (click)="listo.emit()">
        {{ paso() === 'vinculado' ? 'Listo' : 'Cancelar' }}
      </button>
    </section>
  `,
})
export class AccesoPuertaComponent {
  private readonly api = inject(PuertaApi);

  readonly ficha = input.required<FichaPuerta>();
  readonly zonaHoraria = input('America/La_Paz');
  /** El último `acceso.vinculado` que llegó en vivo (lo escucha la página). */
  readonly avisoVinculado = input<AvisoVinculado | null>(null);
  readonly listo = output<void>();

  protected readonly paso = signal<Paso>('generando');
  protected readonly acceso = signal<AccesoGenerado | null>(null);
  protected readonly vinculado = signal<{ modelo: string; hora: string } | null>(null);
  protected readonly motivo = signal('');
  protected readonly error = signal('');
  private sondeo: ReturnType<typeof setInterval> | undefined;

  constructor() {
    queueMicrotask(() => void this.generate());
    effect(() => {
      const aviso = this.avisoVinculado();
      if (aviso && aviso.accesoId === this.acceso()?.id) {
        this.markVinculado(aviso.modelo, aviso.hora);
      }
    });
    inject(DestroyRef).onDestroy(() => clearInterval(this.sondeo));
  }

  protected primerNombre(): string {
    return this.ficha().nombre.split(' ')[0] ?? '';
  }

  protected expira(acceso: AccesoGenerado): Date {
    return new Date(acceso.expiraAt);
  }

  protected sinProtocolo(url: string): string {
    return url.replace(/^https?:\/\//, '');
  }

  protected async generate(): Promise<void> {
    clearInterval(this.sondeo);
    this.paso.set('generando');
    try {
      const motivo = this.motivo().trim();
      const acceso = await this.api.createAcceso(this.ficha().id, motivo || undefined);
      this.acceso.set(acceso);
      this.paso.set('mostrando');
      // Respaldo del aviso en vivo.
      this.sondeo = setInterval(() => void this.poll(acceso.id), SONDEO_MS);
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'MOTIVO_REQUERIDO') {
        this.paso.set('motivo');
        return;
      }
      this.error.set(getMensajeError(error));
      this.paso.set('error');
    }
  }

  private async poll(id: string): Promise<void> {
    if (this.paso() !== 'mostrando') return;
    const estado = await this.api.getAcceso(id).catch(() => null);
    if (estado?.estado === 'vinculado' && estado.vinculadoAt) {
      this.markVinculado(estado.modelo ?? 'Celular', estado.vinculadoAt);
    }
  }

  private markVinculado(modelo: string, hora: string): void {
    if (this.paso() === 'vinculado') return;
    clearInterval(this.sondeo);
    this.vinculado.set({
      modelo,
      hora: new Intl.DateTimeFormat('es-BO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: this.zonaHoraria(),
      }).format(new Date(hora)),
    });
    this.paso.set('vinculado');
  }
}
