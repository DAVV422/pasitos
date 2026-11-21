import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AvisoComponent,
  BotonDirective,
  CuentaRegresivaComponent,
  EstadoComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type CanjeConfirmado, type VistaCobro } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';

/** Los textos de Flujos §5.5. */
const MENSAJES: Readonly<Record<string, string>> = {
  CANJE_VENCIDO: 'El cobro venció. Pide que generen uno nuevo.',
  CANJE_YA_CONFIRMADO: 'Este cobro ya fue pagado.',
  SIN_CONEXION: 'No pudimos conectar. Intenta de nuevo.',
};

/**
 * Pagar el cobro de la mesa (HU-313 §3, mockups A4 y A9): *"Mesa 1 te cobra"*, el total y lo que
 * queda; al confirmar, el comprobante muy grande para mostrarlo en la mesa.
 */
@Component({
  selector: 'app-cobro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, CuentaRegresivaComponent, EstadoComponent, RouterLink],
  template: `
    @if (confirmado(); as c) {
      <!-- A9 -->
      <section class="flex flex-col items-center gap-4 pt-4 text-center" role="status">
        <div
          class="border-ok-border bg-ok-bg/40 flex w-full flex-col items-center gap-2 rounded-2xl border-2 p-6"
        >
          <p class="text-success text-2xl font-extrabold">Canje confirmado</p>
          <p class="font-display text-7xl font-extrabold" data-testid="comprobante">
            {{ c.comprobante }}
          </p>
          <p class="text-xl font-semibold">Muéstralo en la mesa.</p>
          <ul class="mt-2 flex flex-col gap-1 text-lg font-bold">
            @for (i of c.items; track i.premioId) {
              <li>{{ i.cantidad }} × {{ i.nombre }}</li>
            }
          </ul>
        </div>
        <p class="text-muted">
          Te quedan <b class="text-text">{{ c.saldo }}</b> {{ nombrePuntos() }}.
        </p>
        <a pxBoton="secundario" [bloque]="true" routerLink="/inicio">Volver a Inicio</a>
      </section>
    } @else if (vista(); as v) {
      <!-- A4 -->
      <section class="flex flex-col gap-4">
        <h1 class="text-2xl font-extrabold">{{ v.mesa }} te cobra</h1>
        <ul class="border-line bg-surface flex flex-col gap-1 rounded-xl border p-4">
          @for (i of v.items; track i.premioId) {
            <li class="flex justify-between">
              <span>{{ i.cantidad }} × {{ i.nombre }}</span
              ><span>{{ i.puntos * i.cantidad }}</span>
            </li>
          }
        </ul>
        <p class="font-display text-4xl font-extrabold">
          Total: {{ v.total }} {{ nombrePuntos() }}
        </p>
        @if (falta() > 0) {
          <px-aviso variante="advertencia">Te faltan {{ falta() }} {{ nombrePuntos() }}.</px-aviso>
        } @else {
          <p class="text-muted">Te quedan {{ v.saldoDespues }}.</p>
        }
        <px-cuenta-regresiva
          [hasta]="expira(v)"
          (vencio)="error.set(mensajes['CANJE_VENCIDO'] ?? '')"
        />
        <button
          pxBoton
          type="button"
          class="min-h-14 text-xl"
          [deshabilitado]="falta() > 0 || error() !== null"
          [cargando]="confirmando()"
          (click)="confirm()"
        >
          Confirmar canje
        </button>
        @if (error(); as e) {
          <px-aviso variante="peligro">{{ e }}</px-aviso>
        }
      </section>
    } @else if (error(); as e) {
      <section class="flex flex-col gap-4 pt-4">
        <px-aviso variante="peligro">{{ e }}</px-aviso>
        <a pxBoton routerLink="/escanear">Escanear otro cobro</a>
      </section>
    } @else {
      <px-estado tipo="cargando" titulo="Abriendo el cobro…" />
    }
  `,
})
export class CobroPage implements OnInit {
  readonly token = input.required<string>();
  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);

  protected readonly vista = signal<VistaCobro | null>(null);
  protected readonly confirmado = signal<CanjeConfirmado | null>(null);
  protected readonly confirmando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensajes = MENSAJES;
  /** La misma clave para un doble toque o un reintento: cobra una sola vez (V8). */
  private readonly clave = crypto.randomUUID();

  protected readonly falta = computed(() => {
    const v = this.vista();
    return v ? Math.max(0, v.total - v.saldo) : 0;
  });
  protected readonly nombrePuntos = computed(
    () => this.sesion.estado()?.evento.nombrePuntos ?? 'puntos',
  );

  async ngOnInit(): Promise<void> {
    try {
      this.vista.set(await this.api.getCobro(this.token()));
    } catch (error) {
      this.error.set(this.toMensaje(error));
    }
  }

  protected expira(vista: VistaCobro): Date {
    return new Date(vista.expiraAt);
  }

  protected async confirm(): Promise<void> {
    if (this.confirmando()) return;
    this.confirmando.set(true);
    this.error.set(null);
    try {
      const confirmado = await this.api.confirmCobro(this.token(), this.clave);
      this.confirmado.set(confirmado);
      const estado = this.sesion.estado();
      if (estado) this.sesion.set({ ...estado, saldo: confirmado.saldo });
      void this.sesion.refresh();
    } catch (error) {
      this.error.set(this.toMensaje(error));
    } finally {
      this.confirmando.set(false);
    }
  }

  private toMensaje(error: unknown): string {
    if (!(error instanceof ErrorApi)) return 'Algo salió mal. Intenta de nuevo.';
    return MENSAJES[error.code] ?? error.detail;
  }
}
