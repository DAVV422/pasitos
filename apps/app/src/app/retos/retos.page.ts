import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EstadoComponent } from '@pasitos/ui';
import { getRetosVista, groupRetos } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';
import { RetoTarjetaComponent } from './reto-tarjeta.component';

/**
 * *Retos* (mockup A2): agrupados en *Por hacer*, *Más tarde* y *Completados*. HU-309 suma el
 * detalle de cada reto (`/retos/:id`).
 */
@Component({
  selector: 'app-retos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, RetoTarjetaComponent],
  template: `
    <h1 class="text-2xl font-extrabold">Retos</h1>
    @if (!sesion.evento() || !sesion.estado()) {
      <px-estado tipo="cargando" titulo="Cargando los retos…" />
    } @else if (retos().length === 0) {
      <px-estado tipo="vacio" titulo="Todavía no hay retos en este evento." />
    } @else {
      @let zona = sesion.estado()?.evento?.zonaHoraria ?? 'America/La_Paz';
      @let g = grupos();
      <p class="text-muted">{{ g.completados.length }} de {{ retos().length }} completados</p>
      @for (grupo of secciones(); track grupo.titulo) {
        @if (grupo.retos.length > 0) {
          <section class="flex flex-col gap-3" [attr.aria-label]="grupo.titulo">
            <h2 class="text-muted mt-2 text-sm font-bold uppercase">{{ grupo.titulo }}</h2>
            @for (reto of grupo.retos; track reto.id) {
              <app-reto-tarjeta [reto]="reto" [zona]="zona" [accion]="puedeActuar()" />
            }
          </section>
        }
      }
    }
  `,
})
export class RetosPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly retos = computed(() =>
    getRetosVista(this.sesion.estado(), this.sesion.evento()),
  );
  protected readonly grupos = computed(() => groupRetos(this.retos()));
  protected readonly secciones = computed(() => {
    const g = this.grupos();
    return [
      { titulo: 'Por hacer', retos: g.porHacer },
      { titulo: 'Más tarde', retos: g.masTarde },
      { titulo: 'Completados', retos: g.completados },
      { titulo: 'Cerrados', retos: g.cerrados },
    ];
  });
  protected readonly puedeActuar = computed(
    () => this.sesion.estado()?.evento.estado === 'en_curso' && !this.sesion.sinConexion(),
  );
}
