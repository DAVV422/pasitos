import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoComponent, IconoComponent } from '@pasitos/ui';
import { getRetosVista } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';

const NOMBRES_TIPO: Readonly<Record<string, string>> = {
  sala: 'Sala',
  stand: 'Stand',
  mesa: 'Mesa de canje',
  servicio: 'Servicio',
};

const ZOOMS = [1, 2, 3] as const;

/**
 * *Mapa* (HU-309 §2 y HU-414): el plano con un marcador por lugar. Al tocar uno se ve su ficha
 * (qué es, sus sponsors y sus retos); desde la lista, *Ver en el mapa*. Con zoom para planos
 * grandes. Los lugares sin marca siguen en la lista.
 */
@Component({
  selector: 'app-mapa-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, IconoComponent, RouterLink],
  template: `
    <a
      routerLink="/cuenta"
      class="text-muted inline-flex min-h-11 items-center gap-1 self-start font-semibold"
    >
      <px-icono nombre="back" [tamano]="18" />Más
    </a>
    <h1 class="text-2xl font-extrabold">Mapa</h1>
    @if (sesion.errorEvento()) {
      <px-estado tipo="error" titulo="No pudimos cargar el mapa. Revisa tu conexión." />
    } @else if (sesion.evento(); as evento) {
      @if (!evento.info.planoUrl && evento.lugares.length === 0) {
        <px-estado tipo="vacio" titulo="Este evento todavía no tiene mapa." />
      } @else {
        @if (evento.info.planoUrl; as plano) {
          <section class="flex flex-col gap-2" id="plano" aria-label="Plano del evento">
            <div class="border-line bg-surface overflow-auto rounded-xl border">
              <div class="relative" [style.width.%]="zoom() * 100">
                <img
                  [src]="plano"
                  alt="Plano del evento"
                  class="block w-full select-none"
                  draggable="false"
                />
                @for (lugar of marcados(); track lugar.id) {
                  <button
                    type="button"
                    class="text-on-points absolute flex h-9 min-w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 px-1.5 text-sm font-bold shadow-md"
                    [class.bg-points]="lugar.id !== elegidoId()"
                    [class.bg-danger]="lugar.id === elegidoId()"
                    [class.border-surface]="true"
                    [class.scale-125]="lugar.id === elegidoId()"
                    [style.left.%]="(lugar.mapaX ?? 0) * 100"
                    [style.top.%]="(lugar.mapaY ?? 0) * 100"
                    [attr.aria-label]="lugar.nombre"
                    [attr.aria-pressed]="lugar.id === elegidoId()"
                    (click)="elegidoId.set(lugar.id)"
                  >
                    {{ lugar.etiqueta }}
                  </button>
                }
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-muted text-sm">
                @if (marcados().length > 0) {
                  Toca un número para ver qué hay ahí.
                } @else {
                  Los lugares están en la lista.
                }
              </p>
              <div class="flex gap-1" role="group" aria-label="Zoom del plano">
                @for (z of zooms; track z) {
                  <button
                    type="button"
                    class="border-line min-h-11 min-w-11 rounded-lg border px-2 text-sm font-semibold"
                    [class.bg-points]="zoom() === z"
                    [class.text-on-points]="zoom() === z"
                    [attr.aria-pressed]="zoom() === z"
                    (click)="zoom.set(z)"
                  >
                    {{ z }}×
                  </button>
                }
              </div>
            </div>
            @if (elegido(); as lugar) {
              <article
                class="border-points bg-surface flex flex-col gap-2 rounded-xl border-2 p-4"
                aria-live="polite"
                data-testid="ficha-lugar"
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-muted text-xs font-semibold uppercase">
                      {{ nombreTipo(lugar.tipo) }}
                    </p>
                    <h2 class="text-lg font-bold">{{ lugar.etiqueta }} · {{ lugar.nombre }}</h2>
                  </div>
                  <button
                    type="button"
                    class="text-muted min-h-11 min-w-11"
                    aria-label="Cerrar"
                    (click)="elegidoId.set(null)"
                  >
                    <px-icono nombre="x" [tamano]="20" />
                  </button>
                </div>
                @if (lugar.descripcion) {
                  <p class="text-sm">{{ lugar.descripcion }}</p>
                }
                @for (sponsor of lugar.sponsors; track sponsor.id) {
                  <p class="flex items-center gap-2 text-sm">
                    @if (sponsor.logoUrl) {
                      <img [src]="sponsor.logoUrl" alt="" class="h-8 w-8 rounded object-contain" />
                    }
                    <b>{{ sponsor.nombre }}</b>
                  </p>
                }
                @for (reto of lugar.retos; track reto.id) {
                  <a
                    [routerLink]="['/retos', reto.id]"
                    class="text-points text-sm font-semibold underline"
                    >{{ reto.nombre }} · +{{ reto.puntos }}</a
                  >
                }
              </article>
            }
          </section>
        }
        <ul class="flex flex-col gap-2" aria-label="Lugares">
          @for (lugar of lugares(); track lugar.id) {
            <li class="border-line bg-surface flex gap-3 rounded-xl border p-4">
              <span
                class="bg-points text-on-points flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-1.5 font-bold"
                [attr.aria-label]="'Número ' + lugar.etiqueta"
                >{{ lugar.etiqueta }}</span
              >
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <h2 class="font-bold">{{ lugar.nombre }}</h2>
                <p class="text-muted text-xs">{{ nombreTipo(lugar.tipo) }}</p>
                @if (lugar.descripcion) {
                  <p class="text-muted text-sm">{{ lugar.descripcion }}</p>
                }
                @for (sponsor of lugar.sponsors; track sponsor.id) {
                  <p class="text-sm">{{ sponsor.nombre }}</p>
                }
                @for (reto of lugar.retos; track reto.id) {
                  <a
                    [routerLink]="['/retos', reto.id]"
                    class="text-points text-sm font-semibold underline"
                    >{{ reto.nombre }} · +{{ reto.puntos }}</a
                  >
                }
                @if (evento.info.planoUrl && lugar.mapaX !== null) {
                  <button
                    type="button"
                    class="text-points inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold"
                    (click)="verEnElMapa(lugar.id)"
                  >
                    <px-icono nombre="pin" [tamano]="16" />Ver en el mapa
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <px-estado tipo="cargando" titulo="Cargando el mapa…" />
    }
  `,
})
export class MapaPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly zooms = ZOOMS;
  protected readonly zoom = signal<(typeof ZOOMS)[number]>(1);
  protected readonly elegidoId = signal<string | null>(null);

  protected readonly lugares = computed(() => {
    const retos = getRetosVista(this.sesion.estado(), this.sesion.evento());
    const evento = this.sesion.evento();
    return (evento?.lugares ?? []).map((lugar, i) => ({
      ...lugar,
      // El número del plano; si no tiene, la posición en la lista.
      etiqueta: String(lugar.numeroMapa ?? i + 1),
      retos: retos.filter((r) => r.lugarId === lugar.id),
      sponsors: (evento?.sponsors ?? []).filter((s) => s.lugarId === lugar.id),
    }));
  });
  protected readonly marcados = computed(() =>
    this.lugares().filter((l) => l.mapaX !== null && l.mapaY !== null),
  );
  protected readonly elegido = computed(
    () => this.lugares().find((l) => l.id === this.elegidoId()) ?? null,
  );

  protected nombreTipo(tipo: string): string {
    return NOMBRES_TIPO[tipo] ?? tipo;
  }

  protected verEnElMapa(id: string): void {
    this.elegidoId.set(id);
    document.getElementById('plano')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
