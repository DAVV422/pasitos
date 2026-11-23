import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { AvisosService, getMensajeError, valorDe } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, EstadoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import {
  FotosApi,
  FotosPendientesService,
  type FotoParaRevisar,
  type MotivoRechazo,
} from './fotos-api.service';

const MOTIVOS: readonly { readonly valor: MotivoRechazo; readonly texto: string }[] = [
  { valor: 'no_corresponde', texto: 'No corresponde al reto' },
  { valor: 'no_se_ve', texto: 'No se ve bien' },
  { valor: 'repetida', texto: 'Repetida' },
  { valor: 'inapropiada', texto: 'Inapropiada' },
  { valor: 'otro', texto: 'Otro motivo…' },
];

/**
 * *Fotos por revisar* (HU-323 §3), para el celular del stand y también la computadora: la foto
 * grande, quién la mandó y los botones fijos abajo. Atajos: `A` aprueba, `R` abre los motivos.
 * Al decidir pasa sola a la siguiente.
 */
@Component({
  selector: 'adm-fotos-revisar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent],
  host: { '(document:keydown)': 'onTecla($event)' },
  template: `
    <section class="mx-auto flex w-full max-w-xl flex-col gap-4 pb-28">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-2xl font-extrabold">Fotos por revisar</h1>
        <p class="text-muted" aria-live="polite" data-testid="pendientes">
          {{ totalTexto() }}
        </p>
      </header>
      @if (retos().length > 1) {
        <select aria-label="Reto" (change)="chooseReto(valorDe($event))">
          <option value="">Todos mis retos</option>
          @for (r of retos(); track r.retoId) {
            <option [value]="r.retoId" [selected]="r.retoId === retoId()">
              {{ r.nombre }} ({{ r.pendientes }})
            </option>
          }
        </select>
      }
      @if (error(); as e) {
        <px-aviso variante="peligro" role="alert">{{ e }}</px-aviso>
      }
      @switch (estado()) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('vacio') {
          <px-estado tipo="vacio" titulo="No hay fotos por revisar">
            Aparecen aquí apenas alguien manda una.
          </px-estado>
        }
        @default {
          @if (foto(); as f) {
            <p class="text-muted text-sm">{{ f.envio.reto }} · +{{ f.puntos }}</p>
            <a [href]="f.foto.url1200" target="_blank" rel="noopener" class="block">
              <img
                [src]="f.foto.url1200"
                [alt]="'Foto de ' + f.asistente.nombre"
                class="border-line max-h-[55dvh] w-full rounded-xl border object-contain"
              />
            </a>
            <div class="flex flex-col gap-1">
              <p class="text-lg">
                <b data-testid="nombre">{{ f.asistente.nombre }}</b>
                <span class="text-muted"> · {{ f.asistente.codigo }}</span>
              </p>
              <p class="text-muted text-sm">
                {{ hace(f.enviadaAt) }} · {{ f.origen === 'camara' ? '📷 Cámara' : '🖼 Galería' }}
                @if (f.autorizaUso) {
                  · Autoriza el uso ✓
                }
              </p>
              @if (f.intento > 1) {
                <p class="text-sm">
                  {{ f.intento }}.º intento
                  @for (a of f.intentosAnteriores; track $index) {
                    · el {{ $index + 1 }}.º: {{ a.motivo ?? 'rechazada' }}
                  }
                </p>
              }
            </div>
            @if (rechazando()) {
              <div class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-3">
                @for (m of motivos; track m.valor) {
                  <button
                    type="button"
                    pxBoton="secundario"
                    [disabled]="decidiendo()"
                    (click)="reject(m.valor)"
                  >
                    {{ m.texto }}
                  </button>
                }
                @if (conNota()) {
                  <input
                    aria-label="El motivo, para la persona"
                    maxlength="300"
                    [value]="nota()"
                    (input)="nota.set(valorDe($event))"
                  />
                  <button
                    type="button"
                    pxBoton="peligro"
                    [disabled]="nota().trim().length < 3"
                    (click)="reject('otro')"
                  >
                    Rechazar con este motivo
                  </button>
                }
              </div>
            }
          }
        }
      }
    </section>
    @if (foto()) {
      <footer
        class="border-line bg-surface fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-3 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          pxBoton="peligro-contorno"
          class="min-h-14 text-lg"
          [disabled]="decidiendo()"
          (click)="rechazando.set(!rechazando())"
        >
          Rechazar ▾
        </button>
        <button
          type="button"
          pxBoton
          class="min-h-14 text-lg"
          [cargando]="decidiendo()"
          (click)="approve()"
        >
          ✓ Aprobar
        </button>
      </footer>
    }
  `,
})
export class FotosRevisarPage implements OnInit {
  private readonly api = inject(FotosApi);
  private readonly pendientesService = inject(FotosPendientesService);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  protected readonly motivos = MOTIVOS;
  protected readonly estado = signal<'cargando' | 'vacio' | 'listo'>('cargando');
  protected readonly foto = signal<FotoParaRevisar | null>(null);
  protected readonly retoId = signal<string | null>(null);
  protected readonly rechazando = signal(false);
  protected readonly conNota = signal(false);
  protected readonly nota = signal('');
  protected readonly decidiendo = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly valorDe = valorDe;

  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly retos = computed(() => this.pendientesService.pendientes()?.items ?? []);
  protected readonly totalTexto = computed(() => {
    const items = this.retos().filter((r) => !this.retoId() || r.retoId === this.retoId());
    const total = items.reduce((s, r) => s + r.pendientes, 0);
    return `${total} por revisar`;
  });

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      const actual = this.foto();
      if (actual) void this.api.release(actual.envio.id).catch(() => undefined);
    });
    this.pendientesService.watch(this.eventoId(), destroy);
  }

  async ngOnInit(): Promise<void> {
    await this.loadNext();
  }

  protected async chooseReto(id: string): Promise<void> {
    const actual = this.foto();
    if (actual) await this.api.release(actual.envio.id).catch(() => undefined);
    this.retoId.set(id || null);
    await this.loadNext();
  }

  protected onTecla(evento: KeyboardEvent): void {
    const objetivo = evento.target as HTMLElement | null;
    if (!this.foto() || objetivo?.tagName === 'INPUT' || objetivo?.tagName === 'SELECT') return;
    if (evento.key === 'a' || evento.key === 'A') void this.approve();
    if (evento.key === 'r' || evento.key === 'R') this.rechazando.set(!this.rechazando());
  }

  protected hace(iso: string): string {
    const minutos = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
    return minutos < 1 ? 'recién' : `hace ${minutos} min`;
  }

  protected async approve(): Promise<void> {
    const actual = this.foto();
    if (!actual || this.decidiendo()) return;
    await this.decide(async () => {
      const resultado = await this.api.approve(actual.envio.id);
      this.avisos.ok(
        resultado.estado === 'aprobada'
          ? resultado.yaTenia
            ? `Aprobada · ${resultado.asistente}: ya tenía los puntos del reto, no se suman otra vez.`
            : `Aprobada · ${resultado.asistente} +${resultado.puntos}`
          : resultado.motivo === 'agotado'
            ? 'El reto se agotó: las fotos pendientes se rechazaron.'
            : `Rechazada · ${resultado.asistente}: ya había completado el reto.`,
      );
    });
  }

  protected async reject(motivo: MotivoRechazo): Promise<void> {
    const actual = this.foto();
    if (!actual || this.decidiendo()) return;
    if (motivo === 'otro' && !this.conNota()) {
      this.conNota.set(true);
      return;
    }
    await this.decide(async () => {
      const resultado = await this.api.reject(
        actual.envio.id,
        motivo,
        motivo === 'otro' ? this.nota().trim() : undefined,
      );
      this.avisos.ok(`Rechazada · ${resultado.asistente}`);
    });
  }

  private async decide(trabajo: () => Promise<void>): Promise<void> {
    this.decidiendo.set(true);
    this.error.set(null);
    try {
      await trabajo();
      await this.loadNext();
    } catch (error) {
      this.error.set(error instanceof ErrorApi ? getMensajeError(error) : 'Algo salió mal.');
      if (
        error instanceof ErrorApi &&
        (error.code === 'FOTO_YA_TOMADA' || error.code === 'FOTO_YA_REVISADA')
      ) {
        await this.loadNext();
      }
    } finally {
      this.decidiendo.set(false);
    }
  }

  /** La siguiente foto; mientras se mira, la imagen ya está precargada (la trae el navegador). */
  private async loadNext(): Promise<void> {
    this.rechazando.set(false);
    this.conNota.set(false);
    this.nota.set('');
    try {
      const foto = await this.api.next(this.eventoId(), this.retoId());
      this.foto.set(foto);
      this.estado.set(foto ? 'listo' : 'vacio');
    } catch (error) {
      this.error.set(getMensajeError(error));
      this.estado.set('vacio');
    }
    void this.pendientesService.refresh();
  }
}
