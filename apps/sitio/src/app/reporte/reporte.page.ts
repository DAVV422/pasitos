import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  makeStateKey,
  PendingTasks,
  RESPONSE_INIT,
  signal,
  TransferState,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { FORMAS_DE_ENTRAR, UMBRAL_EVENTO_PEQUENO, type Reporte } from '@pasitos/dominio';
import { BotonDirective } from '@pasitos/ui';
import { FUENTE_REPORTE } from './fuente-reporte';

interface Estado {
  readonly reporte: Reporte | null;
  readonly error: boolean;
}

interface Barra {
  readonly nombre: string;
  readonly valor: number;
  readonly detalle: string;
}

const formato = (zona: string, opciones: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-BO', { timeZone: zona, ...opciones });

/**
 * El reporte compartido con un enlace (HU-402 §5, inventario R1): solo totales, sin nombres ni
 * datos de las personas, con la tarjeta de Stellar. No se indexa. Si el enlace no sirve, `404`.
 */
@Component({
  selector: 'sit-reporte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective],
  host: { class: 'flex flex-col gap-8' },
  template: `
    @if (estado(); as s) {
      @if (s.reporte; as r) {
        <header class="flex items-center gap-4">
          @if (r.datos.evento.logo) {
            <img
              [src]="r.datos.evento.logo"
              alt=""
              width="64"
              height="64"
              class="h-16 w-16 rounded-xl"
            />
          }
          <div class="flex flex-col gap-1">
            <p class="text-muted text-sm font-bold">Reporte del evento</p>
            <h1 class="text-4xl font-extrabold tracking-tight">{{ r.datos.evento.nombre }}</h1>
            <p class="text-muted" data-testid="subtitulo">{{ subtitulo() }}</p>
          </div>
        </header>

        @if (r.datos.evento.tipo === 'prueba') {
          <p class="border-points rounded-2xl border-2 p-4 font-bold">Evento de prueba</p>
        }
        @if (r.datos.pequeno) {
          <p class="text-muted">
            Evento con menos de {{ umbral }} personas: por privacidad se muestran solo los totales.
          </p>
        }

        <section class="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Los números">
          @for (n of numeros(); track n.etiqueta) {
            <div class="border-line bg-surface rounded-2xl border p-4">
              <p class="text-3xl font-extrabold tabular-nums">{{ n.valor }}</p>
              <p class="text-muted text-sm">{{ n.etiqueta }}</p>
            </div>
          }
        </section>

        @if (porForma().length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="como-entraron">
            <h2 id="como-entraron" class="text-2xl font-extrabold">Cómo entraron</h2>
            <ul class="flex flex-col gap-2">
              @for (b of porForma(); track b.nombre) {
                <li class="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                  <span class="truncate">{{ b.nombre }}</span>
                  <span class="bg-track h-3 rounded-full" aria-hidden="true">
                    <span
                      class="bg-points-fill block h-3 rounded-full"
                      [style.width.%]="(b.valor / maximo(porForma())) * 100"
                    ></span>
                  </span>
                  <span class="tabular-nums">{{ b.valor }}</span>
                </li>
              }
            </ul>
          </section>
        }

        @if (porHora().length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="por-hora">
            <h2 id="por-hora" class="text-2xl font-extrabold">Personas activas por hora</h2>
            <ul class="flex flex-col gap-2">
              @for (b of porHora(); track b.nombre) {
                <li class="grid grid-cols-[4rem_1fr_auto] items-center gap-3 text-sm">
                  <span>{{ b.nombre }}</span>
                  <span class="bg-track h-3 rounded-full" aria-hidden="true">
                    <span
                      class="bg-points-fill block h-3 rounded-full"
                      [style.width.%]="(b.valor / maximo(porHora())) * 100"
                    ></span>
                  </span>
                  <span class="tabular-nums">{{ b.valor }}</span>
                </li>
              }
            </ul>
            @if (r.datos.asistencia.retencion; as ret) {
              <p class="text-muted text-sm">
                Primera hora: {{ ret.primeraHora }} · última hora: {{ ret.ultimaHora }} personas
                activas.
              </p>
            }
          </section>
        }

        <section class="flex flex-col gap-3" aria-labelledby="retos">
          <h2 id="retos" class="text-2xl font-extrabold">Participación por reto</h2>
          <p class="text-muted text-sm">
            {{ porcentaje(r.datos.participacion.conReto) }} de los presentes completó al menos un
            reto · {{ porcentaje(r.datos.participacion.conCanje) }} canjeó al menos un premio.
          </p>
          <ul class="flex flex-col gap-2">
            @for (b of porReto(); track b.nombre) {
              <li class="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                <span class="truncate">{{ b.nombre }}</span>
                <span class="bg-track h-3 rounded-full" aria-hidden="true">
                  <span
                    class="bg-points-fill block h-3 rounded-full"
                    [style.width.%]="(b.valor / maximo(porReto())) * 100"
                  ></span>
                </span>
                <span class="tabular-nums">{{ b.valor }}{{ b.detalle }}</span>
              </li>
            }
          </ul>
          @if (r.datos.participacion.porSponsor.length > 0) {
            <p class="text-sm">
              @for (s of r.datos.participacion.porSponsor; track s.nombre; let ultimo = $last) {
                <b>{{ s.nombre }}</b>: {{ s.participaciones }}{{ ultimo ? '' : ' · ' }}
              }
            </p>
          }
        </section>

        <section class="grid gap-4 md:grid-cols-2">
          <div class="border-line rounded-2xl border p-4">
            <h2 class="mb-2 text-xl font-extrabold">{{ nombrePuntos() }}</h2>
            <dl class="grid grid-cols-2 gap-1 text-sm">
              <dt class="text-muted">Ganados</dt>
              <dd class="tabular-nums">{{ r.datos.puntos.ganados }}</dd>
              <dt class="text-muted">Canjeados</dt>
              <dd class="tabular-nums">{{ r.datos.puntos.canjeados }}</dd>
              <dt class="text-muted">Ajustados a mano</dt>
              <dd class="tabular-nums">{{ r.datos.puntos.ajustados }}</dd>
              <dt class="text-muted">Vencidos al cierre</dt>
              <dd class="tabular-nums">{{ r.datos.puntos.vencidos }}</dd>
            </dl>
          </div>
          <div class="border-line rounded-2xl border p-4">
            <h2 class="mb-2 text-xl font-extrabold">Premios</h2>
            <p class="text-sm">{{ r.datos.premios.canjes }} canjes</p>
            <ul class="mt-1 flex flex-col gap-1 text-sm">
              @for (p of r.datos.premios.porPremio; track p.nombre) {
                <li>{{ p.nombre }}: {{ p.entregados }} entregados</li>
              }
            </ul>
          </div>
        </section>

        <section
          class="border-points flex flex-col gap-2 rounded-2xl border-2 p-6"
          aria-labelledby="stellar"
          data-testid="stellar"
        >
          <h2 id="stellar" class="text-2xl font-extrabold">Reporte verificable</h2>
          @if (r.stellar.estado === 'registrado') {
            <p>
              Los movimientos del evento quedaron sellados en
              {{
                r.stellar.red === 'testnet'
                  ? 'la red de pruebas de Stellar (testnet)'
                  : 'una red local de Stellar'
              }}.
            </p>
          } @else {
            <p>El cierre en Stellar todavía está pendiente.</p>
          }
          @if (r.stellar.enlaceContrato; as enlace) {
            <a class="underline" [href]="enlace" target="_blank" rel="noopener"
              >Ver el contrato en stellar.expert</a
            >
          }
          @if (r.stellar.huellaFinal; as huella) {
            <p class="text-muted text-sm break-all">Huella final: {{ huella }}</p>
          }
          <p class="text-muted text-sm">
            {{ r.stellar.lotes.length }}
            {{ r.stellar.lotes.length === 1 ? 'lote anclado' : 'lotes anclados' }}.
          </p>
        </section>
      } @else {
        <h1 class="text-4xl font-extrabold tracking-tight">Este reporte no está disponible</h1>
        <p class="text-muted text-lg">El enlace no existe o el organizador dejó de compartirlo.</p>
        <div><a pxBoton="secundario" href="/eventos">Ver eventos</a></div>
      }
    } @else {
      <p class="text-muted">Cargando…</p>
    }
  `,
})
export class ReportePage {
  private readonly fuente = inject(FUENTE_REPORTE);
  private readonly transferido = inject(TransferState);
  private readonly respuesta = inject(RESPONSE_INIT, { optional: true });
  private readonly titulo = inject(Title);
  private readonly meta = inject(Meta);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  protected readonly umbral = UMBRAL_EVENTO_PEQUENO;
  protected readonly estado = signal<Estado | null>(null);
  private readonly datos = computed(() => this.estado()?.reporte?.datos ?? null);

  protected readonly subtitulo = computed(() => {
    const d = this.datos();
    if (!d) return '';
    const fecha = formato(d.evento.zonaHoraria, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(d.evento.inicioAt));
    return [d.evento.organizacion, fecha, d.evento.lugar].filter(Boolean).join(' · ');
  });

  protected readonly nombrePuntos = computed(() => {
    const nombre = this.datos()?.evento.nombrePuntos ?? 'puntos';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  });

  protected readonly numeros = computed(() => {
    const d = this.datos();
    if (!d) return [];
    return [
      { etiqueta: 'Presentes', valor: String(d.asistencia.presentes) },
      {
        etiqueta: 'Tasa de asistencia',
        valor: d.asistencia.tasa === null ? '—' : `${Math.round(d.asistencia.tasa * 100)} %`,
      },
      { etiqueta: 'Participaciones', valor: String(d.participacion.participaciones) },
      { etiqueta: 'Premios entregados', valor: String(d.premios.entregados) },
    ];
  });

  protected readonly porForma = computed<Barra[]>(
    () =>
      this.datos()?.asistencia.porForma.map((f) => ({
        nombre: FORMAS_DE_ENTRAR[f.forma],
        valor: f.total,
        detalle: '',
      })) ?? [],
  );

  protected readonly porHora = computed<Barra[]>(() => {
    const d = this.datos();
    if (!d?.asistencia.franjas) return [];
    const hora = formato(d.evento.zonaHoraria, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return d.asistencia.franjas.map((f) => ({
      nombre: hora.format(new Date(f.hora)),
      valor: f.activos,
      detalle: '',
    }));
  });

  protected readonly porReto = computed<Barra[]>(
    () =>
      this.datos()?.participacion.porReto.map((r) => ({
        nombre: r.nombre,
        valor: r.participaciones,
        detalle: ` / ${r.tope}`,
      })) ?? [],
  );

  constructor() {
    const clave = makeStateKey<Estado>(`reporte-${this.token}`);
    const guardado = this.transferido.get(clave, null);
    if (guardado) {
      this.show(guardado);
    } else {
      void inject(PendingTasks).run(async () => {
        const estado = await this.load();
        this.transferido.set(clave, estado);
        this.show(estado);
      });
    }
  }

  protected maximo(barras: readonly Barra[]): number {
    return Math.max(1, ...barras.map((b) => b.valor));
  }

  protected porcentaje(parte: number): string {
    const presentes = this.datos()?.asistencia.presentes ?? 0;
    return presentes > 0 ? `${Math.round((parte / presentes) * 100)} %` : '0 %';
  }

  private async load(): Promise<Estado> {
    try {
      return { reporte: await this.fuente(this.token), error: false };
    } catch {
      return { reporte: null, error: true };
    }
  }

  private show(estado: Estado): void {
    this.estado.set(estado);
    // Aunque sea público, no se indexa (HU-402 §5).
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
    const reporte = estado.reporte;
    if (!reporte) {
      if (!estado.error && this.respuesta) this.respuesta.status = 404;
      this.titulo.setTitle('Reporte no disponible · Pasitos');
      return;
    }
    const { evento, asistencia } = reporte.datos;
    const titulo = `${evento.nombre} · ${asistencia.presentes} presentes · Reporte verificable`;
    this.titulo.setTitle(`${evento.nombre} · Reporte · Pasitos`);
    this.meta.updateTag({ property: 'og:title', content: titulo });
    this.meta.updateTag({ property: 'og:description', content: this.subtitulo() });
    if (evento.logo) this.meta.updateTag({ property: 'og:image', content: evento.logo });
  }
}
