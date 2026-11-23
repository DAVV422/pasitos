import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { canDo } from '@pasitos/dominio';
import { AvisosService, getMensajeError, valorDe } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, EstadoComponent } from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { EventosApi } from './eventos-api.service';
import { FotosApi, type FotoPanel, type ListaFotos } from './fotos-api.service';

const ESTADOS: readonly { readonly valor: string; readonly texto: string }[] = [
  { valor: 'recibida', texto: 'Por revisar' },
  { valor: 'en_revision', texto: 'En revisión' },
  { valor: 'aprobada', texto: 'Aprobada' },
  { valor: 'rechazada', texto: 'Rechazada' },
  { valor: 'rechazada_sistema', texto: 'Rechazada por el sistema' },
  { valor: 'anulada', texto: 'Deshecha' },
];

const TEXTO_ESTADO = new Map(ESTADOS.map((e) => [e.valor, e.texto]));

type Filtro = 'reto' | 'estado' | 'revisor' | 'origen' | 'autoriza';

/**
 * *Fotos → Todas* (HU-324 §1): las miniaturas con sus filtros, los contadores y la descarga para
 * redes (solo las aprobadas con autorización vigente). D y C ven todas; los responsables, las de
 * sus retos (lo decide el servidor).
 */
@Component({
  selector: 'adm-fotos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent],
  template: `
    <section class="flex flex-col gap-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-extrabold">Fotos</h1>
          @if (lista()?.contadores; as c) {
            <p class="text-muted" data-testid="contadores">
              {{ c.aprobadas }} aprobadas · {{ c.conAutorizacion }} con autorización
            </p>
          }
        </div>
        @if (puedeDescargar()) {
          <button
            type="button"
            pxBoton
            data-testid="descargar-fotos"
            [cargando]="descargando()"
            (click)="download()"
          >
            {{ retoFiltrado() ? 'Descargar las de este reto' : 'Descargar para redes' }}
          </button>
        }
      </header>
      @if (avisoBorrado(); as fecha) {
        <px-aviso variante="info" data-testid="aviso-borrado">
          Las fotos autorizadas se borran el {{ fecha }}. Descárgalas antes si las vas a usar.
        </px-aviso>
      }
      @if (mensaje(); as m) {
        <px-aviso [variante]="m.variante" role="alert">{{ m.texto }}</px-aviso>
      }
      <div class="flex flex-wrap gap-2">
        <select aria-label="Reto" (change)="setFiltro('reto', valorDe($event))">
          <option value="">Todos los retos</option>
          @for (r of retos(); track r.id) {
            <option [value]="r.id">{{ r.nombre }}</option>
          }
        </select>
        <select aria-label="Estado" (change)="setFiltro('estado', valorDe($event))">
          <option value="">Todos los estados</option>
          @for (e of estados; track e.valor) {
            <option [value]="e.valor">{{ e.texto }}</option>
          }
        </select>
        @if (revisores().length > 0) {
          <select aria-label="Revisó" (change)="setFiltro('revisor', valorDe($event))">
            <option value="">Cualquier revisor</option>
            @for (r of revisores(); track r.id) {
              <option [value]="r.id">{{ r.nombre }}</option>
            }
          </select>
        }
        <select aria-label="Origen" (change)="setFiltro('origen', valorDe($event))">
          <option value="">Cámara o galería</option>
          <option value="camara">Cámara</option>
          <option value="galeria">Galería</option>
        </select>
        <select aria-label="Autorización" (change)="setFiltro('autoriza', valorDe($event))">
          <option value="">Con o sin autorización</option>
          <option value="si">Autoriza el uso</option>
          <option value="no">No autoriza</option>
        </select>
      </div>
      @switch (estado()) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('error') {
          <px-estado tipo="error" titulo="No pudimos cargar las fotos">
            <button type="button" pxBoton="secundario" (click)="load()">Reintentar</button>
          </px-estado>
        }
        @case ('vacio') {
          <px-estado tipo="vacio" titulo="No hay fotos">
            Aparecen aquí apenas alguien manda una.
          </px-estado>
        }
        @default {
          <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="fotos">
            @for (f of fotos(); track f.id) {
              <li class="border-line bg-surface flex flex-col gap-1 rounded-xl border p-2">
                @if (f.miniatura) {
                  <img
                    [src]="f.miniatura"
                    [alt]="'Foto de ' + f.asistente.nombre"
                    loading="lazy"
                    class="aspect-square w-full rounded-lg object-cover"
                  />
                } @else {
                  <div
                    class="bg-track text-muted flex aspect-square w-full items-center justify-center rounded-lg text-sm"
                  >
                    Sin imagen
                  </div>
                }
                <p class="text-sm font-bold">{{ f.asistente.nombre }}</p>
                <p class="text-muted text-xs">{{ f.reto.nombre }} · {{ f.intento }}.º intento</p>
                <p class="text-xs">
                  {{ textoEstado(f) }}
                  @if (f.revisor) {
                    · {{ f.revisor }}
                  }
                </p>
                <p class="text-muted text-xs">
                  {{ f.origen === 'camara' ? '📷 Cámara' : '🖼 Galería' }}
                  @if (f.autorizaUso) {
                    · Autoriza ✓
                  } @else if (f.autorizaUsoRetiradaAt) {
                    · Retiró la autorización
                  }
                </p>
                @if (f.retiradaDespuesDe; as fecha) {
                  <px-aviso variante="peligro">
                    Retiró su autorización después de la descarga del {{ fecha.slice(0, 10) }}: no
                    la publiques.
                  </px-aviso>
                }
                @if (puedeDeshacer() && f.estado === 'aprobada') {
                  <button
                    type="button"
                    pxBoton="peligro-contorno"
                    class="text-xs"
                    (click)="cancel(f)"
                  >
                    Deshacer
                  </button>
                }
              </li>
            }
          </ul>
          @if (lista()?.pagination?.nextCursor) {
            <button type="button" pxBoton="secundario" [cargando]="cargandoMas()" (click)="more()">
              Ver más
            </button>
          }
        }
      }
    </section>
  `,
})
export class FotosPage implements OnInit {
  private readonly api = inject(FotosApi);
  private readonly eventosApi = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  protected readonly estados = ESTADOS;
  protected readonly valorDe = valorDe;
  protected readonly estado = signal<'cargando' | 'error' | 'vacio' | 'listo'>('cargando');
  protected readonly lista = signal<ListaFotos | null>(null);
  protected readonly fotos = signal<readonly FotoPanel[]>([]);
  protected readonly retos = signal<readonly { readonly id: string; readonly nombre: string }[]>(
    [],
  );
  protected readonly filtros = signal<Partial<Record<Filtro, string>>>({});
  protected readonly descargando = signal(false);
  /** El reto del filtro, si hay uno: *Descargar* baja solo las de ese reto. */
  protected readonly retoFiltrado = computed(() => {
    const id = this.filtros().reto;
    return id ? (this.retos().find((r) => r.id === id) ?? null) : null;
  });
  protected readonly cargandoMas = signal(false);
  protected readonly mensaje = signal<{
    variante: 'info' | 'peligro';
    texto: string;
  } | null>(null);

  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly puedeDescargar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'fotos.descargar');
  });
  protected readonly puedeDeshacer = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'puntos.ajustar');
  });
  /** *"Las fotos autorizadas se borran el 21/02"*, desde 7 días antes (HU-324 §3). */
  protected readonly avisoBorrado = computed(() => {
    const iso = this.lista()?.borradoAutorizadas;
    if (!iso) return null;
    const falta = Date.parse(iso) - Date.now();
    if (falta > 7 * 86_400_000) return null;
    const fecha = new Date(iso);
    const dd = String(fecha.getDate()).padStart(2, '0');
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  });
  /** Quienes revisaron, de lo que ya se cargó. */
  protected readonly revisores = computed(() => {
    const vistos = new Map<string, string>();
    for (const f of this.fotos()) {
      if (f.revisorId && f.revisor) vistos.set(f.revisorId, f.revisor);
    }
    return [...vistos].map(([id, nombre]) => ({ id, nombre }));
  });

  async ngOnInit(): Promise<void> {
    void this.eventosApi.listRetos(this.eventoId()).then(
      (retos) =>
        this.retos.set(
          retos.filter((r) => r.tipo === 'foto').map((r) => ({ id: r.id, nombre: r.nombre })),
        ),
      () => undefined,
    );
    await this.load();
  }

  protected textoEstado(f: FotoPanel): string {
    const texto = TEXTO_ESTADO.get(f.estado) ?? f.estado;
    return f.motivo && f.estado !== 'aprobada' ? `${texto} (${f.motivo})` : texto;
  }

  protected async setFiltro(filtro: Filtro, valor: string): Promise<void> {
    this.filtros.update((f) => ({ ...f, [filtro]: valor || undefined }));
    await this.load();
  }

  async load(): Promise<void> {
    this.estado.set('cargando');
    try {
      const lista = await this.api.list(this.eventoId(), this.filtros());
      this.lista.set(lista);
      this.fotos.set(lista.items);
      this.estado.set(lista.items.length > 0 ? 'listo' : 'vacio');
    } catch {
      this.estado.set('error');
    }
  }

  protected async more(): Promise<void> {
    const cursor = this.lista()?.pagination.nextCursor;
    if (!cursor) return;
    this.cargandoMas.set(true);
    try {
      const lista = await this.api.list(this.eventoId(), { ...this.filtros(), cursor });
      this.lista.set(lista);
      this.fotos.update((f) => [...f, ...lista.items]);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    } finally {
      this.cargandoMas.set(false);
    }
  }

  /**
   * Solo las aprobadas con autorización vigente; la descarga queda en la bitácora. Con el filtro de
   * reto, solo las de ese reto; si no, todas, cada reto en su carpeta del ZIP.
   */
  protected async download(): Promise<void> {
    const cantidad = this.lista()?.contadores?.descargables ?? 0;
    const reto = this.retoFiltrado();
    const cuales = reto
      ? `${cantidad} fotos aprobadas del reto «${reto.nombre}» que autorizan su uso`
      : `${cantidad} fotos aprobadas que autorizan su uso, cada reto en su carpeta`;
    if (!window.confirm(`Se descargan ${cuales}. La descarga queda en la bitácora. ¿Seguir?`)) {
      return;
    }
    this.descargando.set(true);
    this.mensaje.set(null);
    try {
      const { operacionId } = await this.api.createDescarga(this.eventoId(), reto?.id);
      for (let intento = 0; intento < 120; intento++) {
        const operacion = await this.eventosApi.getOperacion(operacionId);
        if (operacion.descarga) {
          window.location.href = operacion.descarga.url;
          this.avisos.ok('Descargamos las fotos.');
          return;
        }
        if (operacion.estado === 'fallida') throw new Error(operacion.error ?? 'Falló');
        await new Promise((r) => setTimeout(r, 1_000));
      }
      this.mensaje.set({
        variante: 'info',
        texto: 'El ZIP sigue armándose. Intenta en un rato.',
      });
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    } finally {
      this.descargando.set(false);
    }
  }

  /** Deshacer una aprobada: se quitan los puntos (HU-323). */
  protected async cancel(f: FotoPanel): Promise<void> {
    const motivo = window.prompt(
      `¿Deshacer la foto de ${f.asistente.nombre}? Se le quitan los puntos. Escribe el motivo:`,
    );
    if (!motivo || motivo.trim().length < 5) return;
    try {
      await this.api.cancel(f.id, motivo.trim());
      this.avisos.ok(`Deshicimos la foto de ${f.asistente.nombre}.`);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }
}
