import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChipComponent, EstadoComponent } from '@pasitos/ui';
import { formatDia, formatHora } from '../formato';
import { getRetosVista } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';
import { getLugaresAgenda, groupAgenda } from './agenda-vista';

/**
 * *Agenda* (HU-309 §2): por día y lugar, con *Ahora* marcado y los puntos de las actividades que
 * tienen reto. Sale de `/app/evento` (o de su copia sin conexión).
 */
@Component({
  selector: 'app-agenda-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, EstadoComponent, RouterLink],
  template: `
    <h1 class="text-2xl font-extrabold">Agenda</h1>
    @if (sesion.errorEvento()) {
      <px-estado tipo="error" titulo="No pudimos cargar la agenda. Revisa tu conexión." />
    } @else if (!sesion.evento()) {
      <px-estado tipo="cargando" titulo="Cargando la agenda…" />
    } @else if (sesion.evento()?.agenda.length === 0) {
      <px-estado tipo="vacio" titulo="Este evento todavía no tiene agenda." />
    } @else {
      @if (lugares().length > 1) {
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar por lugar">
          @for (opcion of opcionesLugar(); track opcion.valor) {
            <button
              type="button"
              class="border-line min-h-11 rounded-full border px-4 text-sm font-semibold"
              [class.bg-points]="lugar() === opcion.valor"
              [class.text-on-points]="lugar() === opcion.valor"
              [attr.aria-pressed]="lugar() === opcion.valor"
              (click)="lugar.set(opcion.valor)"
            >
              {{ opcion.texto }}
            </button>
          }
        </div>
      }
      @for (dia of dias(); track dia.clave) {
        <section class="flex flex-col gap-2" [attr.aria-label]="diaTexto(dia.clave)">
          <h2 class="text-muted mt-2 text-sm font-bold uppercase">{{ diaTexto(dia.clave) }}</h2>
          @for (a of dia.actividades; track a.id) {
            <article
              class="border-line bg-surface flex gap-4 rounded-xl border p-4"
              [class.border-points]="a.ahora"
              [class.opacity-60]="a.terminada"
            >
              <p class="w-14 shrink-0 font-bold">{{ hora(a.inicioAt) }}</p>
              <div class="flex min-w-0 flex-col gap-1">
                @if (a.ahora) {
                  <px-chip variante="puntos">Ahora</px-chip>
                }
                <h3 class="leading-snug font-bold">{{ a.titulo }}</h3>
                <p class="text-muted text-sm">
                  {{ hora(a.inicioAt) }}–{{ hora(a.finAt) }}
                  @if (a.lugar) {
                    · {{ a.lugar }}
                  }
                </p>
                @if (a.expositor) {
                  <p class="text-sm">{{ a.expositor }}</p>
                }
                @if (a.puntos && a.retoId) {
                  <a
                    [routerLink]="['/retos', a.retoId]"
                    class="text-points text-sm font-semibold underline"
                    >+{{ a.puntos }} {{ nombrePuntos() }}</a
                  >
                }
              </div>
            </article>
          }
        </section>
      } @empty {
        <px-estado tipo="vacio" titulo="No hay actividades en este lugar." />
      }
    }
  `,
})
export class AgendaPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly lugar = signal<string | null>(null);
  private readonly ahora = signal(Date.now());
  private readonly zona = computed(
    () => this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz',
  );
  protected readonly nombrePuntos = computed(
    () => this.sesion.evento()?.info.nombrePuntos ?? 'puntos',
  );
  protected readonly lugares = computed(() => getLugaresAgenda(this.sesion.evento()?.agenda ?? []));
  protected readonly opcionesLugar = computed(() => [
    { valor: null, texto: 'Todos' },
    ...this.lugares().map((l) => ({ valor: l, texto: l })),
  ]);
  protected readonly dias = computed(() =>
    groupAgenda(this.sesion.evento()?.agenda ?? [], {
      zona: this.zona(),
      ahora: this.ahora(),
      lugar: this.lugar(),
      puntosPorReto: new Map(
        getRetosVista(this.sesion.estado(), this.sesion.evento()).map((r) => [r.id, r.puntos]),
      ),
    }),
  );

  constructor() {
    // *Ahora* se mueve solo, una vez por minuto.
    const reloj = setInterval(() => this.ahora.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected hora(fecha: string): string {
    return formatHora(fecha, this.zona());
  }

  /** `AAAA-MM-DD` → *"sábado 21 de noviembre"* (al mediodía, para no cambiar de día). */
  protected diaTexto(clave: string): string {
    return formatDia(`${clave}T12:00:00Z`, 'UTC');
  }
}
