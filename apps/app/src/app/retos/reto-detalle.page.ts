import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EstadoComponent, IconoComponent } from '@pasitos/ui';
import { formatDiaYHora, formatHora } from '../formato';
import { getComoSeCompleta, getRetosVista } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';
import { RetoTarjetaComponent } from './reto-tarjeta.component';

/**
 * El detalle de un reto (`/retos/:id`, HU-309 §2): su estado, cómo se completa, dónde, cuándo y de
 * qué sponsor o charla es. Solo los retos que la persona ve (HU-325).
 */
@Component({
  selector: 'app-reto-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, IconoComponent, RetoTarjetaComponent, RouterLink],
  template: `
    <a routerLink="/retos" class="text-muted inline-flex min-h-11 items-center gap-1 font-semibold">
      <px-icono nombre="back" [tamano]="18" />Retos
    </a>
    @if (sesion.errorEvento()) {
      <px-estado tipo="error" titulo="No pudimos cargar el reto. Revisa tu conexión." />
    } @else if (!sesion.evento() || !sesion.estado()) {
      <px-estado tipo="cargando" titulo="Cargando el reto…" />
    } @else if (reto(); as r) {
      @let zona = sesion.estado()?.evento?.zonaHoraria ?? 'America/La_Paz';
      <app-reto-tarjeta [reto]="r" [zona]="zona" [accion]="puedeActuar()" [enlace]="false" />
      @if (r.descripcion) {
        <p class="whitespace-pre-line">{{ r.descripcion }}</p>
      }
      <dl class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
        <div>
          <dt class="text-muted text-sm font-bold uppercase">Cómo se completa</dt>
          <dd>{{ como() }}</dd>
        </div>
        @if (r.lugar) {
          <div>
            <dt class="text-muted text-sm font-bold uppercase">Dónde</dt>
            <dd>
              {{ r.lugar }} ·
              <a routerLink="/mapa" class="text-points font-semibold underline">Ver en el mapa</a>
            </dd>
          </div>
        }
        @if (horario(); as h) {
          <div>
            <dt class="text-muted text-sm font-bold uppercase">Cuándo</dt>
            <dd>{{ h }}</dd>
          </div>
        }
        @if (sponsor(); as s) {
          <div>
            <dt class="text-muted text-sm font-bold uppercase">Sponsor</dt>
            <dd>
              <a routerLink="/sponsors" class="font-semibold underline">{{ s }}</a>
            </dd>
          </div>
        }
        @for (a of charlas(); track a.id) {
          <div>
            <dt class="text-muted text-sm font-bold uppercase">En la agenda</dt>
            <dd>
              <a routerLink="/agenda" class="font-semibold underline">{{ a.titulo }}</a>
              · {{ hora(a.inicioAt, zona) }}
            </dd>
          </div>
        }
      </dl>
    } @else {
      <px-estado tipo="vacio" titulo="Este reto no está disponible para ti." />
    }
  `,
})
export class RetoDetallePage {
  protected readonly sesion = inject(SesionAsistente);
  /** De la ruta (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  protected readonly reto = computed(
    () =>
      getRetosVista(this.sesion.estado(), this.sesion.evento()).find((r) => r.id === this.id()) ??
      null,
  );
  protected readonly como = computed(() => {
    const reto = this.reto();
    return reto ? getComoSeCompleta(reto) : '';
  });
  private readonly zona = computed(
    () => this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz',
  );
  protected readonly horario = computed(() => {
    const reto = this.reto();
    if (!reto) return null;
    const { disponibleDesde: desde, disponibleHasta: hasta } = reto;
    if (desde && hasta) {
      return `Del ${formatDiaYHora(desde, this.zona())} a las ${formatHora(hasta, this.zona())}`;
    }
    if (desde) return `Desde el ${formatDiaYHora(desde, this.zona())}`;
    if (hasta) return `Hasta el ${formatDiaYHora(hasta, this.zona())}`;
    return null;
  });
  protected readonly sponsor = computed(() => {
    const id = this.reto()?.sponsorId;
    return id ? (this.sesion.evento()?.sponsors.find((s) => s.id === id)?.nombre ?? null) : null;
  });
  protected readonly charlas = computed(() =>
    (this.sesion.evento()?.agenda ?? []).filter((a) => a.retoId === this.id()),
  );
  protected readonly puedeActuar = computed(
    () => this.sesion.estado()?.evento.estado === 'en_curso' && !this.sesion.sinConexion(),
  );

  protected hora(fecha: string, zona: string): string {
    return formatHora(fecha, zona);
  }
}
