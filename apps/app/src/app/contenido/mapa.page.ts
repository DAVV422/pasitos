import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoComponent } from '@pasitos/ui';
import { getRetosVista } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';

/**
 * *Mapa* (HU-309 §2): el plano en 1200 px con los lugares numerados (una imagen, sin mapa
 * interactivo) y la lista de lugares con sus retos.
 */
@Component({
  selector: 'app-mapa-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, RouterLink],
  template: `
    <h1 class="text-2xl font-extrabold">Mapa</h1>
    @if (sesion.errorEvento()) {
      <px-estado tipo="error" titulo="No pudimos cargar el mapa. Revisa tu conexión." />
    } @else if (sesion.evento(); as evento) {
      @if (!evento.info.planoUrl && evento.lugares.length === 0) {
        <px-estado tipo="vacio" titulo="Este evento todavía no tiene mapa." />
      } @else {
        @if (evento.info.planoUrl; as plano) {
          <a [href]="plano" target="_blank" rel="noopener" class="block">
            <img
              [src]="plano"
              alt="Plano del evento con los lugares numerados"
              loading="lazy"
              class="border-line w-full rounded-xl border"
            />
          </a>
          <p class="text-muted text-sm">Toca el plano para verlo más grande.</p>
        }
        <ul class="flex flex-col gap-2" aria-label="Lugares">
          @for (lugar of lugares(); track lugar.id) {
            <li class="border-line bg-surface flex gap-3 rounded-xl border p-4">
              <span
                class="bg-points text-on-points flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold"
                [attr.aria-label]="lugar.numeroMapa ? 'Número ' + lugar.numeroMapa : null"
                >{{ lugar.numeroMapa ?? '·' }}</span
              >
              <div class="flex min-w-0 flex-col gap-1">
                <h2 class="font-bold">{{ lugar.nombre }}</h2>
                @if (lugar.descripcion) {
                  <p class="text-muted text-sm">{{ lugar.descripcion }}</p>
                }
                @for (reto of lugar.retos; track reto.id) {
                  <a
                    [routerLink]="['/retos', reto.id]"
                    class="text-points text-sm font-semibold underline"
                    >{{ reto.nombre }} · +{{ reto.puntos }}</a
                  >
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
  protected readonly lugares = computed(() => {
    const retos = getRetosVista(this.sesion.estado(), this.sesion.evento());
    return (this.sesion.evento()?.lugares ?? []).map((lugar) => ({
      ...lugar,
      retos: retos.filter((r) => r.lugarId === lugar.id),
    }));
  });
}
