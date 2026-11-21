import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AvisoComponent,
  BotonDirective,
  CuentaRegresivaComponent,
  EstadoComponent,
  IconoComponent,
  QrComponent,
} from '@pasitos/ui';
import { EnVivoService, ErrorApi } from '@pasitos/web-core';
import { MesaApi, type CobroGenerado, type EstadoCobro } from '../mesa-api.service';

const SONDEO_MS = 3_000;
const VOLVER_MS = 10_000;

/**
 * El cobro (HU-316 §3, mockups M1, M3 y M4): el QR para el celular y la cuenta regresiva. La mesa
 * entrega **solo** si ve *Confirmado* en su propia pantalla, con el mismo comprobante del celular.
 */
@Component({
  selector: 'mesa-cobro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CuentaRegresivaComponent,
    EstadoComponent,
    IconoComponent,
    QrComponent,
  ],
  template: `
    @if (estado(); as e) {
      @switch (e.estado) {
        @case ('pendiente') {
          <section class="flex flex-col items-center gap-4 text-center">
            @if (qr(); as texto) {
              <px-qr [texto]="texto" [tamano]="300" descripcion="QR de cobro" />
            } @else {
              <px-aviso variante="info"
                >El QR solo se ve donde se generó (se recargó la página). Cancela y cobra de
                nuevo.</px-aviso
              >
            }
            <p class="text-xl">Pide que lo escaneen con Pasitos.</p>
            <px-cuenta-regresiva [hasta]="expira(e)" (vencio)="void refresh()" />
            <ul class="w-full text-left">
              @for (i of e.items; track i.premioId) {
                <li class="flex justify-between">
                  <span>{{ i.cantidad }} × {{ i.nombre }}</span
                  ><span>{{ i.puntos * i.cantidad }} pts</span>
                </li>
              }
            </ul>
            <p class="font-display text-3xl font-extrabold">Total: {{ e.total }} pts</p>
            <button pxBoton="secundario" type="button" [cargando]="cancelando()" (click)="cancel()">
              Cancelar
            </button>
          </section>
        }
        @case ('confirmado') {
          <section class="flex flex-col items-center gap-3 text-center" role="status">
            <div
              class="border-ok-border bg-ok-bg/40 flex w-full flex-col items-center gap-2 rounded-2xl border-2 p-6"
            >
              <p class="text-success flex items-center gap-2 text-3xl font-extrabold">
                <px-icono nombre="check" [tamano]="36" />Confirmado ✓
              </p>
              <p class="font-display text-7xl font-extrabold" data-testid="comprobante">
                {{ e.comprobante }}
              </p>
              @if (e.asistente; as a) {
                <p class="text-2xl font-bold">{{ a.nombre }} · {{ a.codigo }}</p>
              }
              <ul class="mt-1 flex flex-col gap-1">
                @for (i of e.items; track i.premioId) {
                  <li class="text-xl font-semibold">
                    {{ i.cantidad }} × {{ i.nombre }}
                    @if (i.grupo) {
                      · {{ i.puntos * i.cantidad }} puntos · {{ i.grupo }} ✓
                    }
                  </li>
                }
              </ul>
            </div>
            @if (e.requiereCi) {
              <px-aviso variante="advertencia" class="w-full text-left">
                <span class="text-lg font-bold" data-testid="carnet">
                  Pide el carnet:
                  @if (e.carnet; as c) {
                    @if (c.ci) {
                      {{ c.ci }} · {{ c.verificado ? 'verificado ✓' : 'sin verificar' }}
                    } @else {
                      no lo escribió
                    }
                  }
                </span>
              </px-aviso>
            }
            <p class="text-muted">Entrega solo si el celular muestra el mismo comprobante.</p>
            <button pxBoton type="button" [bloque]="true" class="min-h-14 text-xl" (click)="next()">
              Siguiente
            </button>
          </section>
        }
        @default {
          <section class="flex flex-col gap-4">
            <px-aviso variante="advertencia">
              {{ e.estado === 'cancelado' ? 'El cobro se canceló' : 'El cobro venció' }}, no se
              descontó nada.
            </px-aviso>
            <button pxBoton type="button" (click)="next()">Nuevo canje</button>
          </section>
        }
      }
    } @else if (error(); as texto) {
      <px-aviso variante="peligro">{{ texto }}</px-aviso>
      <button pxBoton="secundario" type="button" (click)="next()">Nuevo canje</button>
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class CobroPage implements OnInit {
  readonly id = input.required<string>();
  private readonly api = inject(MesaApi);
  private readonly router = inject(Router);

  protected readonly estado = signal<EstadoCobro | null>(null);
  /** El QR solo se conoce al generar el cobro: llega por el estado de la navegación. */
  protected readonly qr = signal<string | null>(
    (history.state as { cobro?: CobroGenerado } | null)?.cobro?.qr ?? null,
  );
  protected readonly cancelando = signal(false);
  protected readonly error = signal<string | null>(null);
  private sondeo: ReturnType<typeof setInterval> | undefined;
  private volver: ReturnType<typeof setTimeout> | undefined;
  private candado: WakeLockSentinel | null = null;

  constructor() {
    const destroy = inject(DestroyRef);
    const canal = inject(EnVivoService).connect(
      '/api/v1/mesa/en-vivo',
      ['canje.confirmado', 'canje.vencido'],
      destroy,
    );
    for (const tipo of ['canje.confirmado', 'canje.vencido', 'reiniciar']) {
      canal.on(tipo, (aviso) => {
        const canjeId = (aviso.datos as { canjeId?: string } | null)?.canjeId;
        if (!canjeId || canjeId === this.id()) void this.refresh();
      });
    }
    destroy.onDestroy(() => {
      clearInterval(this.sondeo);
      clearTimeout(this.volver);
      void this.candado?.release().catch(() => undefined);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.refresh();
    // Respaldo del aviso en vivo.
    this.sondeo = setInterval(() => void this.refresh(), SONDEO_MS);
    try {
      this.candado = await navigator.wakeLock.request('screen');
    } catch {
      // Sin permiso: sigue igual.
    }
  }

  protected expira(estado: EstadoCobro): Date {
    return new Date(estado.expiraAt);
  }

  protected async refresh(): Promise<void> {
    try {
      const estado = await this.api.getCobro(this.id());
      this.estado.set(estado);
      if (estado.estado !== 'pendiente') {
        clearInterval(this.sondeo);
        if (estado.estado === 'confirmado' && !this.volver) {
          this.volver = setTimeout(() => this.next(), VOLVER_MS);
        }
      }
    } catch (error) {
      if (!this.estado()) {
        this.error.set(error instanceof ErrorApi ? error.detail : 'No pudimos ver el cobro.');
      }
    }
  }

  protected async cancel(): Promise<void> {
    this.cancelando.set(true);
    try {
      await this.api.cancel(this.id());
    } catch {
      // Ya confirmado: el estado lo muestra.
    } finally {
      this.cancelando.set(false);
      await this.refresh();
    }
  }

  protected next(): void {
    void this.router.navigate(['/canje'], { replaceUrl: true });
  }
}
