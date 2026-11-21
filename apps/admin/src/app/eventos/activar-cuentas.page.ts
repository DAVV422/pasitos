import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getMensajeError } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, EstadoComponent, QrComponent } from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import {
  QrRegistroApi,
  type FranjaQrRegistro,
  type QrRegistroPanel,
} from './qr-registro-api.service';

const MOTIVOS: Readonly<Record<Exclude<FranjaQrRegistro['disponibilidad'], 'activo'>, string>> = {
  invalidado: 'Este QR se invalidó. Pide otro al organizador.',
  fuera_de_horario: 'Este QR está fuera de su horario.',
  tope_lleno: 'Este QR llegó a su tope de cuentas.',
  autoregistro_apagado: 'El autorregistro está apagado en el evento.',
  evento_no_activo: 'El evento no está publicado ni en curso.',
};

/** Un poco después del cambio de franja, para que el servidor ya tenga la nueva. */
const MARGEN_MS = 300;

/**
 * *Activar cuentas* (HU-319 §5): el QR rotativo asignado a esta persona, a pantalla completa y sin
 * que se apague la pantalla. Cambia cada 30 s con la franja que firma el servidor.
 */
@Component({
  selector: 'adm-activar-cuentas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent, QrComponent, RouterLink],
  template: `
    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" [titulo]="error() ?? 'No pudimos cargar tu QR de registro'" />
      }
      @default {
        @if (qrs().length === 0) {
          <px-estado tipo="vacio" titulo="No tienes un QR de registro asignado">
            El organizador te asigna uno en QR de registro.
          </px-estado>
        } @else {
          <section
            class="bg-bg fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-y-auto p-4 text-center"
            aria-live="polite"
          >
            @if (qrs().length > 1) {
              <label class="flex w-full max-w-xs flex-col gap-1 text-left font-semibold">
                QR que muestras
                <select (change)="choose($any($event.target).value)">
                  @for (qr of qrs(); track qr.id) {
                    <option [value]="qr.id" [selected]="qr.id === elegido()">
                      {{ qr.nombre }}
                    </option>
                  }
                </select>
              </label>
            }
            @if (franja(); as f) {
              <h1 class="text-2xl font-extrabold">{{ f.nombre }}</h1>
              @if (f.url) {
                <px-qr
                  [texto]="f.url"
                  [tamano]="tamanoQr()"
                  descripcion="QR para crear tu cuenta"
                />
                <p class="text-muted">Escanéalo con la cámara para entrar al evento.</p>
                <p class="text-lg font-bold" data-testid="activadas">
                  Activaste {{ f.registros }}
                  @if (f.tope !== null) {
                    · te quedan {{ quedan() }}
                  }
                </p>
                @if (f.ultimas.length > 0) {
                  <ul class="text-muted text-sm" aria-label="Últimas cuentas">
                    @for (u of f.ultimas; track u.at) {
                      <li>{{ u.nombre }} · {{ hace(u.at) }}</li>
                    }
                  </ul>
                }
              } @else {
                <px-aviso variante="advertencia">{{ motivo(f) }}</px-aviso>
              }
              @if (sinRed()) {
                <px-aviso variante="advertencia">Sin conexión: el QR puede estar vencido.</px-aviso>
              }
            } @else {
              <px-estado tipo="cargando" />
            }
            <a pxBoton="secundario" routerLink="../">Salir</a>
          </section>
        }
      }
    }
  `,
})
export class ActivarCuentasPage implements OnInit {
  private readonly api = inject(QrRegistroApi);
  private readonly actual = inject(EventoActualService);

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly error = signal<string | null>(null);
  protected readonly qrs = signal<readonly QrRegistroPanel[]>([]);
  protected readonly elegido = signal<string | null>(null);
  protected readonly franja = signal<FranjaQrRegistro | null>(null);
  protected readonly sinRed = signal(false);
  protected readonly tamanoQr = signal(300);
  protected readonly quedan = computed(() => {
    const f = this.franja();
    return f?.tope === null || !f ? null : Math.max(0, f.tope - f.registros);
  });

  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private despierta: WakeLockSentinel | null = null;
  private activa = true;

  constructor() {
    const medir = () =>
      this.tamanoQr.set(Math.max(200, Math.min(innerWidth - 64, innerHeight - 280, 520)));
    medir();
    addEventListener('resize', medir);
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        void this.keepAwake();
        void this.refresh();
      }
    };
    document.addEventListener('visibilitychange', alVolver);
    inject(DestroyRef).onDestroy(() => {
      this.activa = false;
      removeEventListener('resize', medir);
      document.removeEventListener('visibilitychange', alVolver);
      if (this.temporizador) clearTimeout(this.temporizador);
      void this.despierta?.release();
    });
  }

  async ngOnInit(): Promise<void> {
    const eventoId = this.actual.evento()?.id;
    if (!eventoId) return;
    try {
      const qrs = await this.api.listMios(eventoId);
      this.qrs.set(qrs);
      this.elegido.set(qrs[0]?.id ?? null);
      this.estado.set('listo');
      void this.keepAwake();
      await this.refresh();
    } catch (error) {
      this.error.set(getMensajeError(error));
      this.estado.set('error');
    }
  }

  protected choose(id: string): void {
    this.elegido.set(id);
    this.franja.set(null);
    void this.refresh();
  }

  /** *"hace 1 min"*, con la hora del servidor. */
  protected hace(iso: string): string {
    const servidor = this.franja()?.horaServidor ?? Date.now();
    const minutos = Math.max(0, Math.floor((servidor - Date.parse(iso)) / 60_000));
    return minutos < 1 ? 'recién' : `hace ${minutos} min`;
  }

  protected motivo(f: FranjaQrRegistro): string {
    return f.disponibilidad === 'activo' ? '' : MOTIVOS[f.disponibilidad];
  }

  /** Pide la franja y agenda el próximo pedido para cuando cambie (o en 30 s sin red). */
  private async refresh(): Promise<void> {
    const id = this.elegido();
    if (!id || !this.activa) return;
    if (this.temporizador) clearTimeout(this.temporizador);
    let espera = 30_000;
    try {
      const franja = await this.api.getFranja(id);
      this.franja.set(franja);
      this.sinRed.set(false);
      if (franja.validoHasta) espera = franja.validoHasta - franja.horaServidor + MARGEN_MS;
    } catch {
      this.sinRed.set(true);
      espera = 5_000;
    }
    this.temporizador = setTimeout(() => void this.refresh(), Math.max(1_000, espera));
  }

  /** Wake Lock: la pantalla no se apaga mientras se muestra el QR (si el navegador lo permite). */
  private async keepAwake(): Promise<void> {
    try {
      if ('wakeLock' in navigator && !this.despierta) {
        this.despierta = await navigator.wakeLock.request('screen');
        this.despierta.addEventListener('release', () => (this.despierta = null));
      }
    } catch {
      this.despierta = null;
    }
  }
}
