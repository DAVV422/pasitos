import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { canDo, DISTANCIA_ENCIMADOS, findLugaresCercanos, ZOOMS_MAPA } from '@pasitos/dominio';
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

/** Lo que mueve una flecha del teclado (de 0 a 1); con Mayúsculas, más. */
const PASO_TECLADO = 0.002;
const PASO_TECLADO_LARGO = 0.01;

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

function redondear(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
}

/**
 * *Mapa del evento* (HU-414): el plano con una marca por lugar (stands, salas, mesas, servicios).
 * Se elige un lugar y se toca el plano para ponerlo, o se arrastra su número (o se mueve con las
 * flechas). Con zoom para los stands pegados y aviso si dos números quedan encimados en el celular.
 * La gente lo ve en *Mapa* de la app. La posición se guarda de 0 a 1 del ancho y del alto: sirve con
 * el plano en cualquier tamaño.
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
            <div
              class="border-line max-h-[75vh] overflow-auto rounded-xl border [scrollbar-gutter:stable]"
            >
              <div #lienzo class="relative" [style.width.%]="zoom() * 100">
                <img
                  [src]="plano()"
                  alt="Plano del evento"
                  class="block w-full select-none"
                  draggable="false"
                  (load)="setProporcion($event)"
                />
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
                  <!-- El centro del número es el punto exacto: se arrastra o se mueve con las flechas. -->
                  <button
                    type="button"
                    class="text-on-points border-surface absolute flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 px-1 text-xs font-bold shadow-md"
                    [class.bg-points]="l.id !== elegidoId() && !encimados().has(l.id)"
                    [class.bg-danger]="l.id === elegidoId() || encimados().has(l.id)"
                    [class.z-10]="l.id === elegidoId()"
                    [class.cursor-grab]="puedeEditar()"
                    [style.left.%]="getX(l) * 100"
                    [style.top.%]="getY(l) * 100"
                    [attr.title]="l.nombre"
                    [attr.aria-label]="etiqueta(l) + ' · ' + l.nombre"
                    [attr.data-testid]="'marca-' + l.id"
                    [disabled]="!puedeEditar()"
                    (pointerdown)="startArrastre($event, l)"
                    (pointermove)="moveArrastre($event)"
                    (pointerup)="endArrastre(l)"
                    (pointercancel)="cancelArrastre()"
                    (keydown)="moveConTeclado($event, l)"
                  >
                    {{ etiqueta(l) }}
                  </button>
                }
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-muted text-sm">
                {{ marcados().length }} de {{ lista.length }} lugares en el plano. Arrastra un
                número para ajustarlo (o tócalo y usa las flechas).
              </p>
              <div class="flex gap-1" role="group" aria-label="Zoom del plano">
                @for (z of zooms; track z) {
                  <button
                    type="button"
                    [pxBoton]="zoom() === z ? 'primario' : 'secundario'"
                    [chico]="true"
                    [attr.aria-pressed]="zoom() === z"
                    (click)="zoom.set(z)"
                  >
                    {{ z }}×
                  </button>
                }
              </div>
            </div>
            @if (encimados().size > 0) {
              <px-aviso variante="advertencia" data-testid="aviso-encimados">
                Los números en rojo se enciman en el celular, aun con el zoom más grande. Si son
                lugares distintos, sepáralos un poco. Si de verdad están pegados, déjalos: en la
                app, al tocar uno se ven los de al lado (<i>Muy cerca</i>).
              </px-aviso>
            }
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
                  @if (encimados().get(l.id); as vecinos) {
                    <span class="text-danger block text-xs font-semibold">
                      Encimado con {{ etiquetas(vecinos) }}
                    </span>
                  }
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
  protected readonly zooms = ZOOMS_MAPA;
  protected readonly zoom = signal<(typeof ZOOMS_MAPA)[number]>(1);
  /** Alto / ancho del plano: para medir bien la distancia entre números. */
  private readonly proporcion = signal(1);
  /** Mientras se arrastra un número: dónde va (todavía sin guardar). */
  private readonly enMovimiento = signal<{ id: string; x: number; y: number } | null>(null);
  private arrastre: { id: string; x0: number; y0: number; movio: boolean } | null = null;
  private readonly lienzo = viewChild<ElementRef<HTMLElement>>('lienzo');

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
  /** Los números que se enciman en el celular aun con el zoom más grande. */
  protected readonly encimados = computed(() =>
    findLugaresCercanos(this.lugares() ?? [], DISTANCIA_ENCIMADOS, this.proporcion()),
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

  protected etiquetas(lugares: readonly LugarMapa[]): string {
    return lugares.map((l) => this.etiqueta(l)).join(', ');
  }

  protected nombreTipo(tipo: string): string {
    return NOMBRES_TIPO[tipo] ?? tipo;
  }

  protected setProporcion(evento: Event): void {
    const img = evento.target as HTMLImageElement;
    if (img.naturalWidth > 0) this.proporcion.set(img.naturalHeight / img.naturalWidth);
  }

  protected getX(lugar: LugarMapa): number {
    const movil = this.enMovimiento();
    return movil?.id === lugar.id ? movil.x : (lugar.mapaX ?? 0);
  }

  protected getY(lugar: LugarMapa): number {
    const movil = this.enMovimiento();
    return movil?.id === lugar.id ? movil.y : (lugar.mapaY ?? 0);
  }

  /** Del punto de la pantalla al punto de 0 a 1 del plano. */
  private toPunto(clientX: number, clientY: number): { x: number; y: number } | null {
    const caja = this.lienzo()?.nativeElement.getBoundingClientRect();
    if (!caja || caja.width === 0) return null;
    return {
      x: redondear((clientX - caja.left) / caja.width),
      y: redondear((clientY - caja.top) / caja.height),
    };
  }

  /** Del toque al punto de 0 a 1. Con el teclado (sin posición), el centro del plano. */
  protected async marcar(evento: MouseEvent): Promise<void> {
    const lugar = this.elegido();
    if (!lugar) return;
    const conPuntero = evento.clientX !== 0 || evento.clientY !== 0;
    const punto = conPuntero ? this.toPunto(evento.clientX, evento.clientY) : { x: 0.5, y: 0.5 };
    if (!punto) return;
    await this.save(lugar, punto.x, punto.y);
    this.elegidoId.set(null);
  }

  protected startArrastre(evento: PointerEvent, lugar: LugarMapa): void {
    if (!this.puedeEditar() || evento.button !== 0) return;
    evento.preventDefault();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    this.arrastre = { id: lugar.id, x0: evento.clientX, y0: evento.clientY, movio: false };
  }

  protected moveArrastre(evento: PointerEvent): void {
    const arrastre = this.arrastre;
    if (!arrastre) return;
    // Unos píxeles de tolerancia: un toque no es un arrastre.
    const distancia = Math.hypot(evento.clientX - arrastre.x0, evento.clientY - arrastre.y0);
    if (!arrastre.movio && distancia < 4) return;
    arrastre.movio = true;
    const punto = this.toPunto(evento.clientX, evento.clientY);
    if (punto) this.enMovimiento.set({ id: arrastre.id, ...punto });
  }

  protected async endArrastre(lugar: LugarMapa): Promise<void> {
    const arrastre = this.arrastre;
    this.arrastre = null;
    if (!arrastre) return;
    const punto = this.enMovimiento();
    if (!arrastre.movio || !punto) {
      // Un toque: elegirlo, para moverlo tocando el plano o con las flechas.
      this.elegidoId.set(lugar.id);
      return;
    }
    await this.save(lugar, punto.x, punto.y, true);
    this.enMovimiento.set(null);
  }

  protected cancelArrastre(): void {
    this.arrastre = null;
    this.enMovimiento.set(null);
  }

  protected async moveConTeclado(evento: KeyboardEvent, lugar: LugarMapa): Promise<void> {
    const paso = evento.shiftKey ? PASO_TECLADO_LARGO : PASO_TECLADO;
    const deltas: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-paso, 0],
      ArrowRight: [paso, 0],
      ArrowUp: [0, -paso],
      ArrowDown: [0, paso],
    };
    const delta = deltas[evento.key];
    if (!delta || !this.puedeEditar() || lugar.mapaX === null || lugar.mapaY === null) return;
    evento.preventDefault();
    await this.save(
      lugar,
      redondear(lugar.mapaX + delta[0]),
      redondear(lugar.mapaY + delta[1]),
      true,
    );
  }

  protected async save(
    lugar: LugarMapa,
    x: number | null,
    y: number | null,
    silencioso = false,
  ): Promise<void> {
    this.error.set(null);
    try {
      const fila = toLugar(
        await this.api.updateContenido('lugares', lugar.id, { mapaX: x, mapaY: y }),
      );
      this.lugares.set((this.lugares() ?? []).map((l) => (l.id === fila.id ? fila : l)));
      if (!silencioso) {
        this.avisos.ok(
          x === null ? `Quitamos ${lugar.nombre} del plano.` : `Listo: ${lugar.nombre}.`,
        );
      }
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }
}
