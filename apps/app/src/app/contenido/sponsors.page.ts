import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoComponent, IconoComponent } from '@pasitos/ui';
import { getRetosVista } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';

/** *Sponsors* (HU-309 §2): logo (400 px), descripción, enlace, dónde está y sus retos. */
@Component({
  selector: 'app-sponsors-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, IconoComponent, RouterLink],
  template: `
    <a
      routerLink="/cuenta"
      class="text-muted inline-flex min-h-11 items-center gap-1 self-start font-semibold"
    >
      <px-icono nombre="back" [tamano]="18" />Más
    </a>
    <h1 class="text-2xl font-extrabold">Sponsors</h1>
    @if (sesion.errorEvento()) {
      <px-estado tipo="error" titulo="No pudimos cargar los sponsors. Revisa tu conexión." />
    } @else if (!sesion.evento()) {
      <px-estado tipo="cargando" titulo="Cargando los sponsors…" />
    } @else {
      @for (sponsor of sponsors(); track sponsor.id) {
        <article class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
          <div class="flex items-center gap-4">
            @if (sponsor.logoUrl) {
              <img
                [src]="sponsor.logoUrl"
                [alt]="'Logo de ' + sponsor.nombre"
                loading="lazy"
                class="h-16 w-16 shrink-0 rounded-lg object-contain"
              />
            }
            <div class="flex min-w-0 flex-col">
              <h2 class="text-lg font-bold">{{ sponsor.nombre }}</h2>
              @if (sponsor.lugar) {
                <p class="text-muted text-sm">Está en {{ sponsor.lugar }}</p>
              }
            </div>
          </div>
          @if (sponsor.descripcion) {
            <p>{{ sponsor.descripcion }}</p>
          }
          @for (reto of sponsor.retos; track reto.id) {
            <a
              [routerLink]="['/retos', reto.id]"
              class="text-points text-sm font-semibold underline"
              >{{ reto.nombre }} · +{{ reto.puntos }}</a
            >
          }
          @if (sponsor.enlace) {
            <a
              [href]="sponsor.enlace"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold underline"
              >Visitar su página</a
            >
          }
        </article>
      } @empty {
        <px-estado tipo="vacio" titulo="Este evento todavía no tiene sponsors." />
      }
    }
  `,
})
export class SponsorsPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly sponsors = computed(() => {
    const retos = getRetosVista(this.sesion.estado(), this.sesion.evento());
    return (this.sesion.evento()?.sponsors ?? []).map((sponsor) => ({
      ...sponsor,
      retos: retos.filter((r) => r.sponsorId === sponsor.id),
    }));
  });
}
