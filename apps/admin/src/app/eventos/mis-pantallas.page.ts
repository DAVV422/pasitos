import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { EncabezadoPaginaComponent, getMensajeError } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, ChipComponent, EstadoComponent } from '@pasitos/ui';
import { EnVivoService } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import {
  PantallasControlApi,
  type AccionPantalla,
  type HistorialPantalla,
  type PantallaEnVivo,
} from './pantallas-control-api.service';

const ESTADOS: Readonly<Record<PantallaEnVivo['estado'], string>> = {
  activa: 'Mostrando QR',
  pausada: 'En pausa',
  agotado: 'Agotado',
  espera: 'En espera',
  evento_no_activo: 'Evento no activo',
};

const RESULTADOS: Readonly<Record<string, string>> = {
  vencido: 'vencido',
  ya_completado: 'ya completado',
  ya_usado: 'ya usado',
  firma_invalida: 'QR no válido',
  fuera_de_horario: 'fuera de horario',
  sin_check_in: 'sin check-in',
  agotado: 'agotado',
  evento_no_activo: 'evento no activo',
};

/**
 * *Mis pantallas* (HU-315 §4, mockup O7): los controles a distancia de cada pantalla (*Generar
 * otro*, *Pausar*, *Reanudar*, *Cambiar de reto*) y su historial. El operador de stand ve solo las
 * suyas, en el celular.
 */
@Component({
  selector: 'adm-mis-pantallas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    ChipComponent,
    EncabezadoPaginaComponent,
    EstadoComponent,
  ],
  template: `
    <pnl-encabezado-pagina titulo="Mis pantallas" descripcion="El QR de cada pantalla, en vivo." />
    @if (error(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    }
    @if (pantallas(); as lista) {
      @if (lista.length === 0) {
        <px-estado tipo="vacio" titulo="No tienes pantallas asignadas." />
      }
      <ul class="flex flex-col gap-3">
        @for (p of lista; track p.id) {
          <li class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-bold">{{ p.nombre }}</h2>
              <px-chip [variante]="p.estado === 'activa' ? 'ok' : 'atenuado'">{{
                estadoDe(p)
              }}</px-chip>
            </div>
            @if (p.reto; as r) {
              <p>
                {{ r.nombre }} · <b>{{ r.entregados }}</b> de {{ r.tope }}
                @if (p.fijado) {
                  <px-chip variante="puntos">Fijado</px-chip>
                }
              </p>
            }
            @if (p.conectada) {
              <div class="flex flex-wrap gap-2">
                <button
                  pxBoton
                  type="button"
                  [cargando]="enviando() === p.id"
                  (click)="run(p, 'generar_otro')"
                >
                  Generar otro
                </button>
                @if (p.estado === 'pausada') {
                  <button pxBoton="secundario" type="button" (click)="run(p, 'reanudar')">
                    Reanudar
                  </button>
                } @else {
                  <button pxBoton="secundario" type="button" (click)="run(p, 'pausar')">
                    Pausar
                  </button>
                }
                @if (p.opciones.length > 0 || p.fijado) {
                  <select
                    class="px-control h-11"
                    aria-label="Cambiar de reto"
                    (change)="run(p, 'cambiar_reto', $any($event.target).value || null)"
                  >
                    <option value="">Según la agenda</option>
                    @for (o of p.opciones; track o.id) {
                      <option [value]="o.id" [selected]="p.fijado && o.id === p.reto?.id">
                        {{ o.nombre }}
                      </option>
                    }
                  </select>
                }
                <button pxBoton="fantasma" type="button" (click)="toggleHistorial(p.id)">
                  {{ abierta() === p.id ? 'Ocultar historial' : 'Historial' }}
                </button>
              </div>
            } @else {
              <p class="text-muted text-sm">Desconectada: conéctala desde Pantallas.</p>
            }
            @if (abierta() === p.id) {
              @if (historial(); as h) {
                <section class="flex flex-col gap-2 text-sm">
                  <p>
                    <b>{{ h.aceptados }}</b> aceptados
                    @for (r of h.rechazos; track r.resultado) {
                      · {{ resultado(r.resultado) }} · {{ r.total }}
                    }
                  </p>
                  <ol class="text-muted flex max-h-64 flex-col gap-1 overflow-auto">
                    @for (q of h.qr; track $index) {
                      <li>
                        {{ hora(q.inicioAt) }}{{ q.finAt ? '–' + hora(q.finAt) : '' }} ·
                        {{ q.reto }} ·
                        {{ q.franja !== null ? 'franja ' + q.franja : 'un solo uso' }}
                        @if (q.finMotivo) {
                          ·
                          {{
                            q.finMotivo === 'invalidado' && q.invalidadoPor
                              ? 'invalidado por ' + q.invalidadoPor
                              : q.finMotivo
                          }}
                        }
                      </li>
                    } @empty {
                      <li>Todavía no hay QR mostrados.</li>
                    }
                  </ol>
                </section>
              } @else {
                <px-estado tipo="cargando" />
              }
            }
          </li>
        }
      </ul>
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class MisPantallasPage {
  private readonly api = inject(PantallasControlApi);
  private readonly actual = inject(EventoActualService);
  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');

  protected readonly pantallas = signal<readonly PantallaEnVivo[] | null>(null);
  protected readonly historial = signal<HistorialPantalla | null>(null);
  protected readonly abierta = signal<string | null>(null);
  protected readonly enviando = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
    const canal = inject(EnVivoService).connect(
      `/api/v1/eventos/${this.eventoId()}/en-vivo`,
      [
        'contador.actualizado',
        'pantalla.epoca',
        'pantalla.pausada',
        'pantalla.reanudada',
        'pantalla.reto',
      ],
      inject(DestroyRef),
    );
    for (const tipo of [
      'contador.actualizado',
      'pantalla.pausada',
      'pantalla.reanudada',
      'pantalla.reto',
      'reiniciar',
    ]) {
      canal.on(tipo, () => void this.load());
    }
  }

  protected estadoDe(p: PantallaEnVivo): string {
    return p.conectada ? ESTADOS[p.estado] : 'Desconectada';
  }

  protected resultado(clave: string): string {
    return RESULTADOS[clave] ?? clave;
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.actual.evento()?.zonaHoraria ?? 'America/La_Paz',
    }).format(new Date(iso));
  }

  protected async run(
    p: PantallaEnVivo,
    accion: AccionPantalla,
    retoId?: string | null,
  ): Promise<void> {
    this.enviando.set(p.id);
    this.error.set(null);
    try {
      await this.api.control(p.id, accion, retoId);
      await this.load();
      if (this.abierta() === p.id) await this.loadHistorial(p.id);
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.enviando.set(null);
    }
  }

  protected async toggleHistorial(id: string): Promise<void> {
    if (this.abierta() === id) {
      this.abierta.set(null);
      return;
    }
    this.abierta.set(id);
    await this.loadHistorial(id);
  }

  private async loadHistorial(id: string): Promise<void> {
    this.historial.set(null);
    this.historial.set(await this.api.getHistorial(id).catch(() => null));
  }

  private async load(): Promise<void> {
    if (!this.eventoId()) return;
    try {
      this.pantallas.set(await this.api.list(this.eventoId()));
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }
}
