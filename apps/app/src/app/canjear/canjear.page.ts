import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { describeHorarioPremio } from '@pasitos/dominio';
import { BotonDirective, ChipComponent, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { SesionAsistente } from '../sesion-asistente';

/**
 * *Canjear* (HU-313 §3): el catálogo con el precio y *Quedan pocos* o *Agotado*, y **Escanear el
 * cobro** de la mesa. La definición viene de `/app/evento` y el stock, de `/app/estado`.
 */
@Component({
  selector: 'app-canjear-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  imports: [BotonDirective, ChipComponent, EstadoComponent, IconoComponent, RouterLink],
  template: `
    <div class="flex flex-col gap-2">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h1 class="text-2xl font-extrabold">Canjear</h1>
        @if (saldo() !== null) {
          <p class="text-muted text-sm">
            Disponibles:
            <b class="text-points font-display text-base font-extrabold tabular-nums"
              >{{ saldo() }} {{ nombrePuntos() }}</b
            >
          </p>
        }
      </header>
      <p class="text-muted leading-relaxed">
        Elige tu premio en la mesa de canje y escanea el QR de cobro que te muestren.
      </p>
    </div>

    <a pxBoton routerLink="/escanear" class="min-h-14 text-lg">
      <px-icono nombre="scan" [tamano]="22" />Escanear el cobro
    </a>

    @if (premios(); as lista) {
      @if (lista.length === 0) {
        <px-estado tipo="vacio" titulo="Todavía no hay premios." />
      } @else {
        <ul class="grid grid-cols-2 gap-3.5 sm:gap-4">
          @for (p of lista; track p.id) {
            <li
              class="border-line bg-surface flex flex-col justify-between gap-3 rounded-2xl border p-3.5"
              [class.opacity-60]="p.agotado || p.horario"
            >
              <div class="flex flex-col gap-2.5">
                @if (p.imagenUrl) {
                  <img
                    [src]="p.imagenUrl"
                    alt=""
                    class="aspect-square w-full rounded-xl object-cover"
                    loading="lazy"
                  />
                } @else {
                  <div
                    class="bg-surface2 text-muted flex aspect-square w-full items-center justify-center rounded-xl"
                    aria-hidden="true"
                  >
                    <px-icono nombre="gift" [tamano]="36" />
                  </div>
                }
                <p class="leading-snug font-bold">{{ p.nombre }}</p>
              </div>

              <div class="flex flex-col items-start gap-1.5">
                <p class="text-points font-display text-lg font-extrabold tabular-nums">
                  @if (p.puntos === 0) {
                    Gratis
                  } @else {
                    {{ p.puntos }} {{ nombrePuntos() }}
                  }
                </p>
                @if (!p.agotado && p.falta > 0) {
                  <p class="text-muted text-xs">Te faltan {{ p.falta }} {{ nombrePuntos() }}</p>
                }
                @if (p.grupo || p.agotado || p.pocos || p.horario) {
                  <div class="flex flex-wrap gap-1.5 pt-0.5">
                    @if (p.grupo) {
                      <px-chip [variante]="$any(p.grupo.color)">{{ p.grupo.nombre }}</px-chip>
                    }
                    @if (p.horario) {
                      <!-- HU-413: fuera de su horario. -->
                      <px-chip variante="atenuado">{{ p.horario }}</px-chip>
                    } @else if (p.agotado) {
                      <px-chip variante="peligro">Agotado</px-chip>
                    } @else if (p.pocos) {
                      <px-chip variante="puntos">Quedan pocos</px-chip>
                    }
                  </div>
                }
                @if (p.maxPorPersona) {
                  <p class="text-muted text-xs">Hasta {{ p.maxPorPersona }} por persona</p>
                }
                @if (p.requiereCi) {
                  <p class="text-muted text-xs">Lleva tu carnet</p>
                }
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class CanjearPage {
  private readonly sesion = inject(SesionAsistente);
  protected readonly saldo = computed(() => this.sesion.estado()?.saldo ?? null);
  private readonly ahora = signal(new Date());
  protected readonly nombrePuntos = computed(
    () => this.sesion.estado()?.evento.nombrePuntos ?? 'puntos',
  );
  protected readonly premios = computed(() => {
    const evento = this.sesion.evento();
    if (!evento) return null;
    const saldo = this.saldo();
    const zona = this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz';
    const stock = new Map((this.sesion.estado()?.premios ?? []).map((p) => [p.id, p]));
    return evento.premios.map((p) => {
      const s = stock.get(p.id);
      const falta = saldo !== null && p.puntos > saldo ? p.puntos - saldo : 0;
      return {
        ...p,
        agotado: s ? s.disponible === 0 : false,
        pocos: s?.pocos ?? false,
        falta,
        horario: describeHorarioPremio(p, this.ahora(), zona),
      };
    });
  });

  constructor() {
    // HU-413: el horario de los premios cambia con la hora, sin recargar.
    const reloj = setInterval(() => this.ahora.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}
