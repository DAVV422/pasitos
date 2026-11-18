import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChipComponent, IconoComponent } from '@pasitos/ui';
import { formatHora } from '../formato';
import { getComoSeCompleta, type RetoVista } from '../retos-vista';

/** Un reto con su estado para la persona: ícono y texto, nunca solo color (mockup A2). */
@Component({
  selector: 'app-reto-tarjeta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, IconoComponent, RouterLink],
  template: `
    @let r = reto();
    <article class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-4">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-lg leading-snug font-bold">
          @if (enlace()) {
            <a [routerLink]="['/retos', r.id]" class="hover:underline">{{ r.nombre }}</a>
          } @else {
            {{ r.nombre }}
          }
        </h3>
        <px-chip [variante]="r.estadoPersona.estado === 'completado' ? 'ok' : 'puntos'"
          >+{{ r.puntos }}</px-chip
        >
      </div>
      @switch (r.estadoPersona.estado) {
        @case ('disponible') {
          <p class="text-muted flex items-center gap-2 text-sm">
            <px-icono nombre="scan" [tamano]="16" />{{ como() }}
          </p>
          @if (accion()) {
            @if (r.tipo === 'qr') {
              <a
                routerLink="/escanear"
                class="text-points mt-1 inline-flex items-center gap-1 font-bold underline"
                >Escanear</a
              >
            }
          }
        }
        @case ('desde') {
          <p class="text-muted flex items-center gap-2 text-sm">
            <px-icono nombre="clock" [tamano]="16" />Disponible desde las {{ desde() }}
          </p>
        }
        @case ('completado') {
          <p class="text-success flex items-center gap-2 text-sm font-semibold">
            <px-icono nombre="check" [tamano]="16" />Completado
            @if (completado(); as hora) {
              a las {{ hora }}
            }
          </p>
        }
        @case ('agotado') {
          <p class="text-muted flex items-center gap-2 text-sm">
            <px-icono nombre="lock" [tamano]="16" />Se acabaron los puntos de este reto
          </p>
        }
        @default {
          <p class="text-muted flex items-center gap-2 text-sm">
            <px-icono nombre="lock" [tamano]="16" />Ya no está disponible
          </p>
        }
      }
    </article>
  `,
})
export class RetoTarjetaComponent {
  readonly reto = input.required<RetoVista>();
  readonly zona = input.required<string>();
  /** Si se puede actuar ahora (el evento en curso y con red). */
  readonly accion = input(true);
  /** El nombre lleva al detalle (`/retos/:id`, HU-309); en el detalle, no. */
  readonly enlace = input(true);

  protected readonly como = computed(() => getComoSeCompleta(this.reto()));
  protected readonly desde = computed(() => {
    const desde = this.reto().estadoPersona.desde;
    return desde ? formatHora(desde, this.zona()) : '';
  });
  protected readonly completado = computed(() => {
    const hora = this.reto().estadoPersona.completadoAt;
    return hora ? formatHora(hora, this.zona()) : null;
  });
}
