import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BotonDirective, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type MovimientoHistorial } from '../asistente-api.service';
import { formatHora } from '../formato';
import { SesionAsistente } from '../sesion-asistente';

/**
 * Pone cada anulación justo debajo de lo que anula, si los dos están cargados (HU-311 §2:
 * *"Anulado: Canje C-4821 · se devolvieron 50"*).
 */
export function sortConAnulaciones(
  items: readonly MovimientoHistorial[],
): readonly MovimientoHistorial[] {
  const ids = new Set(items.map((m) => m.id));
  const anulacionDe = new Map<string, MovimientoHistorial>();
  for (const m of items) {
    if (m.anulaMovimientoId && ids.has(m.anulaMovimientoId)) {
      anulacionDe.set(m.anulaMovimientoId, m);
    }
  }
  const filas: MovimientoHistorial[] = [];
  for (const m of items) {
    if (m.anulaMovimientoId && ids.has(m.anulaMovimientoId)) continue;
    filas.push(m);
    const anulacion = anulacionDe.get(m.id);
    if (anulacion) filas.push(anulacion);
  }
  return filas;
}

/**
 * *Historial* (HU-311 §2, mockup A10): cada movimiento con su signo y, cuando su lote se confirma,
 * *Registrado en Stellar ✓* con el enlace a la transacción.
 */
@Component({
  selector: 'app-historial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective, EstadoComponent, IconoComponent],
  template: `
    <h1 class="text-2xl font-extrabold">Historial</h1>
    @if (sesion.estado(); as e) {
      <p class="text-muted">
        Tu saldo: <b class="text-text">{{ e.saldo }} {{ e.evento.nombrePuntos }}</b>
      </p>
    }
    @if (cargando() && items().length === 0) {
      <px-estado tipo="cargando" titulo="Cargando tu historial…" />
    } @else if (error() !== null && items().length === 0) {
      <px-estado tipo="error" titulo="No pudimos cargar tu historial." [traceId]="error()" />
    } @else if (items().length === 0) {
      <px-estado tipo="vacio" titulo="Todavía no tienes movimientos." />
    } @else {
      <ul class="flex flex-col gap-2">
        @for (m of filas(); track m.id) {
          <li
            class="border-line bg-surface flex items-start justify-between gap-3 rounded-xl border p-4"
            [class.ml-6]="m.anulaMovimientoId !== null"
          >
            <div class="flex flex-col gap-1">
              <p class="font-semibold" [class.line-through]="anulados().has(m.id)">
                {{ m.detalle }}
              </p>
              <p class="text-muted text-sm">
                {{ hora(m.hora) }} ·
                @if (m.estado === 'registrado_en_stellar') {
                  @if (m.enlaceStellar) {
                    <a
                      [href]="m.enlaceStellar"
                      target="_blank"
                      rel="noopener"
                      class="text-success font-semibold underline"
                      >Registrado en Stellar ✓</a
                    >
                  } @else {
                    <span class="text-success font-semibold">Registrado en Stellar ✓</span>
                  }
                } @else {
                  Confirmado
                }
              </p>
            </div>
            <p
              class="font-display text-lg font-extrabold whitespace-nowrap"
              [class.text-success]="m.puntos > 0"
              [class.text-danger]="m.puntos < 0"
            >
              {{ m.puntos > 0 ? '+' : '' }}{{ m.puntos }}
            </p>
          </li>
        }
      </ul>
      @if (siguiente()) {
        <button pxBoton="secundario" type="button" [cargando]="cargando()" (click)="loadMore()">
          <px-icono nombre="abajo" [tamano]="18" />Ver más
        </button>
      }
    }
  `,
})
export class HistorialPage {
  private readonly api = inject(AsistenteApi);
  protected readonly sesion = inject(SesionAsistente);
  protected readonly items = signal<readonly MovimientoHistorial[]>([]);
  protected readonly siguiente = signal<string | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Lo anulado, para tacharlo. */
  protected readonly anulados = computed(
    () => new Set(this.items().flatMap((m) => (m.anulaMovimientoId ? [m.anulaMovimientoId] : []))),
  );
  protected readonly filas = computed(() => sortConAnulaciones(this.items()));

  constructor() {
    void this.load();
  }

  protected hora(fecha: string): string {
    return formatHora(fecha, this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz');
  }

  protected loadMore(): void {
    void this.load(this.siguiente() ?? undefined);
  }

  private async load(cursor?: string): Promise<void> {
    this.cargando.set(true);
    try {
      const pagina = await this.api.listMovimientos(cursor);
      this.items.update((antes) => (cursor ? [...antes, ...pagina.items] : pagina.items));
      this.siguiente.set(pagina.pagination.nextCursor);
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof ErrorApi ? (error.traceId ?? '') : '');
    } finally {
      this.cargando.set(false);
    }
  }
}
