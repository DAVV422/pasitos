import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { canDo } from '@pasitos/dominio';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getMensajeError,
  getUrlArchivo,
} from '@pasitos/panel';
import { AvisoComponent, BotonDirective, ChipComponent, EstadoComponent } from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { EventosApi, type FilaContenido } from './eventos-api.service';

interface LugarMapa {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly numeroMapa: number | null;
  readonly mapaX: number | null;
  readonly mapaY: number | null;
}

const NOMBRES_TIPO: Readonly<Record<string, string>> = {
  sala: 'Sala',
  stand: 'Stand',
  mesa: 'Mesa',
  servicio: 'Servicio',
};

function toLugar(fila: FilaContenido): LugarMapa {
  return {
    id: fila.id,
    nombre: String(fila['nombre']),
    tipo: String(fila['tipo']),
    numeroMapa: (fila['numeroMapa'] as number | null) ?? null,
    mapaX: (fila['mapaX'] as number | null) ?? null,
    mapaY: (fila['mapaY'] as number | null) ?? null,
  };
}

/**
 * *Mapa del evento* (HU-414): el plano con una marca por lugar (stands, salas, mesas, servicios).
 * Se elige un lugar y se toca el plano para ponerlo; la gente lo ve en *Mapa* de la app. La posición
 * se guarda de 0 a 1 del ancho y del alto: sirve con el plano en cualquier tamaño.
 */
@Component({
  selector: 'adm-mapa-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    ChipComponent,
    EncabezadoPaginaComponent,
    EstadoComponent,
    RouterLink,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Mapa del evento"
      descripcion="Marca en el plano dónde está cada lugar. La gente lo ve en la app para encontrar los stands."
    />
    @if (error(); as e) {
      <px-aviso variante="peligro" role="alert">{{ e }}</px-aviso>
    }
    @if (!plano()) {
      <px-estado tipo="vacio" titulo="Todavía no hay un plano.">
        <a pxBoton="secundario" [routerLink]="['..', 'configuracion']">Subir el plano</a>
      </px-estado>
    } @else if (lugares(); as lista) {
      @if (lista.length === 0) {
        <px-estado tipo="vacio" titulo="Todavía no hay lugares.">
          <a pxBoton="secundario" [routerLink]="['..', 'lugares']">Crear los lugares</a>
        </px-estado>
      } @else {
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section class="flex flex-col gap-2">
            @if (elegido(); as l) {
              <px-aviso variante="info" data-testid="marcando">
                Toca el plano donde está <b>{{ l.nombre }}</b>.
                <button
                  pxAvisoAccion
                  type="button"
                  pxBoton="secundario"
                  [chico]="true"
                  (click)="elegidoId.set(null)"
                >
                  Listo
                </button>
              </px-aviso>
            }
            <div class="border-line relative overflow-hidden rounded-xl border">
              <img [src]="plano()" alt="Plano del evento" class="block w-full select-none" />
              @if (elegido(); as l) {
                <!-- Toda la imagen es el botón para marcar (con el teclado, queda en el centro). -->
                <button
                  type="button"
                  class="absolute inset-0 cursor-crosshair"
                  data-testid="plano"
                  [attr.aria-label]="'Marcar ' + l.nombre + ' en el plano'"
                  (click)="marcar($event)"
                ></button>
              }
              @for (l of marcados(); track l.id) {
                <span
                  class="text-on-points pointer-events-none absolute flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-sm font-bold shadow-md"
                  [class.bg-points]="l.id !== elegidoId()"
                  [class.bg-danger]="l.id === elegidoId()"
                  [style.left.%]="(l.mapaX ?? 0) * 100"
                  [style.top.%]="(l.mapaY ?? 0) * 100"
                  [attr.title]="l.nombre"
                  >{{ etiqueta(l) }}</span
                >
              }
            </div>
            <p class="text-muted text-sm">
              {{ marcados().length }} de {{ lista.length }} lugares en el plano.
            </p>
          </section>

          <ul class="flex flex-col gap-2" aria-label="Lugares">
            @for (l of lista; track l.id) {
              <li
                class="border-line flex items-center justify-between gap-2 rounded-lg border p-2.5"
                [class.border-points]="l.id === elegidoId()"
              >
                <span class="min-w-0">
                  <b class="block truncate">{{ etiqueta(l) }} · {{ l.nombre }}</b>
                  <span class="text-muted text-sm">{{ nombreTipo(l.tipo) }}</span>
                </span>
                <span class="flex shrink-0 items-center gap-1.5">
                  @if (l.mapaX !== null) {
                    <px-chip variante="ok">En el plano</px-chip>
                  }
                  @if (puedeEditar()) {
                    <button
                      type="button"
                      pxBoton="secundario"
                      [chico]="true"
                      [attr.aria-label]="(l.mapaX === null ? 'Marcar ' : 'Mover ') + l.nombre"
                      (click)="elegidoId.set(l.id)"
                    >
                      {{ l.mapaX === null ? 'Marcar' : 'Mover' }}
                    </button>
                    @if (l.mapaX !== null) {
                      <button
                        type="button"
                        pxBoton="fantasma"
                        [chico]="true"
                        [attr.aria-label]="'Quitar ' + l.nombre + ' del plano'"
                        (click)="save(l, null, null)"
                      >
                        Quitar
                      </button>
                    }
                  }
                </span>
              </li>
            }
          </ul>
        </div>
      }
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class MapaPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly actual = inject(EventoActualService);
  private readonly avisos = inject(AvisosService);

  protected readonly lugares = signal<readonly LugarMapa[] | null>(null);
  protected readonly elegidoId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly plano = computed(() => {
    const id = this.actual.evento()?.imagenes.planoArchivoId;
    return id ? getUrlArchivo(id, '1200') : null;
  });
  protected readonly puedeEditar = computed(() => {
    const evento = this.actual.evento();
    return !!evento && canDo(evento.miRol, 'contenido.update') && evento.estado !== 'cerrado';
  });
  protected readonly elegido = computed(
    () => this.lugares()?.find((l) => l.id === this.elegidoId()) ?? null,
  );
  protected readonly marcados = computed(() =>
    (this.lugares() ?? []).filter((l) => l.mapaX !== null && l.mapaY !== null),
  );

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const filas = await this.api.listContenido(this.eventoId(), 'lugares');
      this.lugares.set(filas.map(toLugar));
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  /** El número del plano, o la posición en la lista si no tiene. */
  protected etiqueta(lugar: LugarMapa): string {
    if (lugar.numeroMapa !== null) return String(lugar.numeroMapa);
    const indice = (this.lugares() ?? []).findIndex((l) => l.id === lugar.id);
    return String(indice + 1);
  }

  protected nombreTipo(tipo: string): string {
    return NOMBRES_TIPO[tipo] ?? tipo;
  }

  /** Del toque al punto de 0 a 1. Con el teclado (sin posición), el centro del plano. */
  protected async marcar(evento: MouseEvent): Promise<void> {
    const lugar = this.elegido();
    if (!lugar) return;
    const caja = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const conPuntero = evento.clientX !== 0 || evento.clientY !== 0;
    const x = conPuntero ? (evento.clientX - caja.left) / caja.width : 0.5;
    const y = conPuntero ? (evento.clientY - caja.top) / caja.height : 0.5;
    const redondear = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
    await this.save(lugar, redondear(x), redondear(y));
    this.elegidoId.set(null);
  }

  protected async save(lugar: LugarMapa, x: number | null, y: number | null): Promise<void> {
    this.error.set(null);
    try {
      const fila = toLugar(
        await this.api.updateContenido('lugares', lugar.id, { mapaX: x, mapaY: y }),
      );
      this.lugares.set((this.lugares() ?? []).map((l) => (l.id === fila.id ? fila : l)));
      this.avisos.ok(
        x === null ? `Quitamos ${lugar.nombre} del plano.` : `Listo: ${lugar.nombre}.`,
      );
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }
}
