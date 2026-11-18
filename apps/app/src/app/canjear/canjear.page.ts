import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BotonDirective, ChipComponent, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { SesionAsistente } from '../sesion-asistente';

/**
 * *Canjear* (HU-313 §3): el catálogo con el precio y *Quedan pocos* o *Agotado*, y **Escanear el
 * cobro** de la mesa. La definición viene de `/app/evento` y el stock, de `/app/estado`.
 */
@Component({
  selector: 'app-canjear-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective, ChipComponent, EstadoComponent, IconoComponent, RouterLink],
  template: `
    <h1 class="text-2xl font-extrabold">Canjear</h1>
    <p class="text-muted">
      Elige tu premio en la mesa de canje y escanea el QR de cobro que te muestren.
    </p>
    <a pxBoton routerLink="/escanear" class="min-h-14 text-lg">
      <px-icono nombre="scan" [tamano]="22" />Escanear el cobro
    </a>
    @if (premios(); as lista) {
      @if (lista.length === 0) {
        <px-estado tipo="vacio" titulo="Todavía no hay premios." />
      } @else {
        <ul class="grid grid-cols-2 gap-3">
          @for (p of lista; track p.id) {
            <li class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-3">
              @if (p.imagenUrl) {
                <img
                  [src]="p.imagenUrl"
                  alt=""
                  class="aspect-square w-full rounded-lg object-cover"
                  loading="lazy"
                />
              }
              <p class="leading-tight font-bold">{{ p.nombre }}</p>
              <p class="text-points font-display text-lg font-extrabold">
                {{ p.puntos }} {{ nombrePuntos() }}
              </p>
              @if (p.agotado) {
                <px-chip variante="peligro">Agotado</px-chip>
              } @else if (p.pocos) {
                <px-chip variante="puntos">Quedan pocos</px-chip>
              }
              @if (p.maxPorPersona) {
                <p class="text-muted text-xs">Hasta {{ p.maxPorPersona }} por persona</p>
              }
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
  protected readonly nombrePuntos = computed(
    () => this.sesion.estado()?.evento.nombrePuntos ?? 'puntos',
  );
  protected readonly premios = computed(() => {
    const evento = this.sesion.evento();
    if (!evento) return null;
    const stock = new Map((this.sesion.estado()?.premios ?? []).map((p) => [p.id, p]));
    return evento.premios.map((p) => {
      const s = stock.get(p.id);
      return { ...p, agotado: s ? s.disponible === 0 : false, pocos: s?.pocos ?? false };
    });
  });
}
