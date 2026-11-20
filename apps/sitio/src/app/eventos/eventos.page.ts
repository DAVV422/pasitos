import {
  ChangeDetectionStrategy,
  Component,
  inject,
  makeStateKey,
  PendingTasks,
  signal,
  TransferState,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  FUENTE_EVENTOS,
  type EventoPublico,
  type MomentoEvento,
  type PaginaEventos,
} from './fuente-eventos';

const PESTANAS: readonly { readonly momento: MomentoEvento; readonly texto: string }[] = [
  { momento: 'en_curso', texto: 'En curso' },
  { momento: 'proximos', texto: 'Próximos' },
  { momento: 'pasados', texto: 'Pasados' },
];

const VACIO: Readonly<Record<MomentoEvento, string>> = {
  en_curso: 'Ahora no hay eventos en curso.',
  proximos: 'Todavía no hay eventos próximos.',
  pasados: 'Todavía no hay eventos pasados.',
};

interface Estado {
  readonly momento: MomentoEvento;
  readonly pagina: PaginaEventos | null;
  readonly error: boolean;
}

/** *"Sáb 5 de diciembre · 9:00"*, en la zona del evento. */
function formatFecha(evento: EventoPublico): string {
  const fecha = new Date(evento.inicioAt);
  const opciones = { timeZone: evento.zonaHoraria };
  const dia = new Intl.DateTimeFormat('es-BO', {
    ...opciones,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(fecha);
  const hora = new Intl.DateTimeFormat('es-BO', {
    ...opciones,
    hour: 'numeric',
    minute: '2-digit',
  }).format(fecha);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${hora}`;
}

/**
 * La sección *Eventos* (HU-405, inventario P4): en curso, próximos y pasados, solo los *Público*.
 * Se arma en el servidor con 60 s de caché; las pestañas y *Ver más* son enlaces (la página se
 * pide de nuevo), así no hay que traer nada más al navegador.
 */
@Component({
  selector: 'sit-eventos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    <h1 class="text-4xl font-extrabold tracking-tight">Eventos</h1>
    <p class="text-muted text-lg">Los eventos que usan Pasitos.</p>
    <nav aria-label="Momento" class="border-line flex gap-1 border-b">
      @for (p of pestanas; track p.momento) {
        <a
          [href]="'/eventos?momento=' + p.momento"
          class="-mb-px border-b-2 px-4 py-2 font-semibold"
          [class.border-points]="p.momento === estado().momento"
          [class.text-points]="p.momento === estado().momento"
          [class.border-transparent]="p.momento !== estado().momento"
          [attr.aria-current]="p.momento === estado().momento ? 'page' : null"
          >{{ p.texto }}</a
        >
      }
    </nav>
    @if (estado().error) {
      <p class="text-muted" role="alert">No pudimos cargar los eventos. Intenta en un momento.</p>
    } @else if (estado().pagina; as pagina) {
      @if (pagina.items.length === 0) {
        <p class="text-muted" data-testid="eventos-vacio">
          {{ vacio[estado().momento] }}
          @if (estado().momento !== 'pasados') {
            <a href="/eventos?momento=pasados" class="underline">Mira los pasados</a>.
          }
        </p>
      } @else {
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="eventos">
          @for (e of pagina.items; track e.slug) {
            <li>
              <a
                [href]="'/eventos/' + e.slug"
                class="border-line bg-surface flex h-full flex-col overflow-hidden rounded-xl border"
              >
                @if (e.imagen) {
                  <img
                    [src]="e.imagen"
                    alt=""
                    width="400"
                    height="200"
                    loading="lazy"
                    class="aspect-[2/1] w-full object-cover"
                  />
                } @else {
                  <div class="bg-surface2 aspect-[2/1] w-full"></div>
                }
                <span class="flex flex-col gap-1 p-4">
                  @if (e.estado === 'en_curso') {
                    <span class="text-success text-sm font-bold">En curso</span>
                  }
                  <b class="text-lg">{{ e.nombre }}</b>
                  <span class="text-muted text-sm">{{ fecha(e) }}</span>
                  @if (e.lugar) {
                    <span class="text-muted text-sm">{{ e.lugar }}</span>
                  }
                  <span class="text-muted text-sm">Organiza {{ e.organizacion }}</span>
                </span>
              </a>
            </li>
          }
        </ul>
        @if (pagina.pagination.nextCursor; as cursor) {
          <a
            class="self-start underline"
            [href]="'/eventos?momento=' + estado().momento + '&cursor=' + encode(cursor)"
            >Ver más eventos</a
          >
        }
      }
    } @else {
      <p class="text-muted">Cargando…</p>
    }
  `,
})
export class EventosPage {
  private readonly fuente = inject(FUENTE_EVENTOS);
  private readonly transferido = inject(TransferState);
  private readonly consulta = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly pestanas = PESTANAS;
  protected readonly vacio = VACIO;
  protected readonly fecha = formatFecha;
  protected readonly encode = encodeURIComponent;
  protected readonly estado = signal<Estado>({ momento: 'proximos', pagina: null, error: false });

  constructor() {
    const clave = makeStateKey<Estado>(
      `eventos-${this.consulta.get('momento') ?? ''}-${this.consulta.get('cursor') ?? ''}`,
    );
    const guardado = this.transferido.get(clave, null);
    if (guardado) {
      this.estado.set(guardado);
      return;
    }
    // En el servidor, Angular espera esta tarea antes de mandar la página.
    void inject(PendingTasks).run(async () => {
      const estado = await this.load();
      this.estado.set(estado);
      this.transferido.set(clave, estado);
    });
  }

  /** Sin `momento`, abre en *En curso* si hay alguno; si no, en *Próximos* (HU-405 §3). */
  private async load(): Promise<Estado> {
    const pedido = this.consulta.get('momento');
    const cursor = this.consulta.get('cursor');
    const momento = PESTANAS.some((p) => p.momento === pedido) ? (pedido as MomentoEvento) : null;
    try {
      if (momento) return { momento, pagina: await this.fuente(momento, cursor), error: false };
      const enCurso = await this.fuente('en_curso', null);
      if (enCurso.items.length > 0) return { momento: 'en_curso', pagina: enCurso, error: false };
      return { momento: 'proximos', pagina: await this.fuente('proximos', null), error: false };
    } catch {
      return { momento: momento ?? 'proximos', pagina: null, error: true };
    }
  }
}
