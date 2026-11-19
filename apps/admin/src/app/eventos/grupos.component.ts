import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { canDo, COLORES_GRUPO, NOMBRES_COLOR_GRUPO, type ColorGrupo } from '@pasitos/dominio';
import {
  AvisosService,
  DialogoComponent,
  getErrorCampo,
  getMensajeError,
  MenuAccionesComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { GruposApi, type GrupoPanel } from './grupos-api.service';

/**
 * *Configuración → Grupos* (HU-325 §4): por ejemplo, *VIP*. Cada grupo con su color y cuántas
 * personas, retos y premios tiene. Se agregan personas por código; también desde *Invitados*.
 */
@Component({
  selector: 'adm-grupos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    DialogoComponent,
    EstadoComponent,
    MenuAccionesComponent,
    TarjetaComponent,
  ],
  template: `
    @if (mensaje(); as texto) {
      <px-aviso variante="peligro">{{ texto }}</px-aviso>
    }
    <px-tarjeta>
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-bold">Grupos</h2>
        <p class="text-muted text-sm">
          Un grupo da retos y premios exclusivos, incluso souvenirs de 0 puntos. Los puntos son los
          mismos para todos.
        </p>
      </div>
      @if (puedeEditar()) {
        <form class="mt-4 flex flex-wrap items-end gap-3" (submit)="create($event)" novalidate>
          <px-campo etiqueta="Nombre del grupo" [error]="errores()['nombre'] ?? null" #c1="pxCampo">
            <input
              [id]="c1.idControl"
              [attr.aria-describedby]="c1.idDescripcion"
              maxlength="40"
              placeholder="VIP"
              [value]="nombre()"
              (input)="nombre.set(valorDe($event))"
            />
          </px-campo>
          <px-campo etiqueta="Color" #c2="pxCampo">
            <select [id]="c2.idControl" (change)="color.set($any(valorDe($event)))">
              @for (c of colores; track c) {
                <option [value]="c" [selected]="color() === c">{{ nombreColor(c) }}</option>
              }
            </select>
          </px-campo>
          <button type="submit" pxBoton [cargando]="guardando()">Crear grupo</button>
        </form>
      }
    </px-tarjeta>

    <pnl-dialogo
      [titulo]="'Agregar personas a «' + (agregando()?.nombre ?? '') + '»'"
      [abierto]="!!agregando()"
      (cerrado)="agregando.set(null)"
    >
      <form class="flex flex-col gap-4" (submit)="addMiembros($event)" novalidate>
        <px-campo
          etiqueta="Códigos"
          ayuda="Uno por línea o separados por comas. Por ejemplo: A-0231, A-0232."
          #c3="pxCampo"
        >
          <textarea
            [id]="c3.idControl"
            [attr.aria-describedby]="c3.idDescripcion"
            rows="4"
            [value]="codigos()"
            (input)="codigos.set(valorDe($event))"
          ></textarea>
        </px-campo>
        @if (resultado(); as r) {
          <px-aviso [variante]="r.noEncontrados.length > 0 ? 'advertencia' : 'ok'" role="status">
            Agregamos {{ r.agregados.length }}.
            @if (r.yaEstaban.length > 0) {
              Ya estaban: {{ r.yaEstaban.join(', ') }}.
            }
            @if (r.noEncontrados.length > 0) {
              No encontramos: {{ r.noEncontrados.join(', ') }}.
            }
          </px-aviso>
        }
        <div>
          <button type="submit" pxBoton [cargando]="guardando()">Agregar</button>
        </div>
      </form>
    </pnl-dialogo>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar los grupos" />
      }
      @default {
        @for (g of grupos(); track g.id) {
          <px-tarjeta>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="flex flex-col gap-1">
                <px-chip [variante]="g.color">{{ g.nombre }}</px-chip>
                <span class="text-muted text-sm">
                  {{ g.personas }} {{ g.personas === 1 ? 'persona' : 'personas' }} · {{ g.retos }}
                  {{ g.retos === 1 ? 'reto' : 'retos' }} · {{ g.premios }}
                  {{ g.premios === 1 ? 'premio' : 'premios' }}
                </span>
              </span>
              @if (puedeEditar()) {
                <span class="flex items-center gap-2">
                  <button
                    type="button"
                    pxBoton="secundario"
                    [chico]="true"
                    (click)="openAgregar(g)"
                  >
                    Agregar personas
                  </button>
                  <pnl-menu-acciones [etiqueta]="'Acciones de ' + g.nombre">
                    <button type="button" (click)="rename(g)">Cambiar el nombre</button>
                    @for (c of colores; track c) {
                      @if (c !== g.color) {
                        <button type="button" (click)="setColor(g, c)">
                          Color: {{ nombreColor(c) }}
                        </button>
                      }
                    }
                    <hr />
                    <button type="button" class="pnl-acciones__peligro" (click)="remove(g)">
                      Borrar
                    </button>
                  </pnl-menu-acciones>
                </span>
              }
            </div>
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" titulo="Todavía no hay grupos">
            Crea uno, por ejemplo VIP, para darle retos y premios exclusivos.
          </px-estado>
        }
      }
    }
  `,
})
export class GruposComponent implements OnInit {
  private readonly api = inject(GruposApi);
  private readonly actual = inject(EventoActualService);
  private readonly avisos = inject(AvisosService);

  protected readonly colores = COLORES_GRUPO;
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly grupos = signal<readonly GrupoPanel[]>([]);
  protected readonly nombre = signal('');
  protected readonly color = signal<ColorGrupo>('puntos');
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly agregando = signal<GrupoPanel | null>(null);
  protected readonly codigos = signal('');
  protected readonly resultado = signal<{
    agregados: readonly string[];
    yaEstaban: readonly string[];
    noEncontrados: readonly string[];
  } | null>(null);
  protected readonly valorDe = valorDe;

  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly puedeEditar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'grupos.update') && e.estado !== 'cerrado';
  });

  ngOnInit(): void {
    void this.load();
  }

  protected nombreColor(color: ColorGrupo): string {
    return NOMBRES_COLOR_GRUPO[color];
  }

  protected async create(evento: Event): Promise<void> {
    evento.preventDefault();
    const nombre = this.nombre().trim();
    if (nombre.length < 2) {
      this.errores.set({ nombre: 'Escribe un nombre de 2 a 40 letras.' });
      return;
    }
    this.guardando.set(true);
    this.errores.set({});
    try {
      await this.api.create(this.eventoId(), { nombre, color: this.color() });
      this.nombre.set('');
      this.avisos.ok(`Creamos el grupo «${nombre}».`);
      await this.load();
    } catch (error) {
      const campo = getErrorCampo(error, 'nombre');
      if (campo) this.errores.set({ nombre: campo });
      else this.mensaje.set(getMensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async rename(grupo: GrupoPanel): Promise<void> {
    const nombre = window.prompt('El nombre nuevo del grupo', grupo.nombre)?.trim();
    if (!nombre || nombre === grupo.nombre) return;
    await this.run(() => this.api.update(grupo.id, { nombre }));
  }

  protected async setColor(grupo: GrupoPanel, color: ColorGrupo): Promise<void> {
    await this.run(() => this.api.update(grupo.id, { color }));
  }

  protected async remove(grupo: GrupoPanel): Promise<void> {
    if (!window.confirm(`¿Borrar el grupo «${grupo.nombre}»?`)) return;
    await this.run(() => this.api.delete(grupo.id));
  }

  protected openAgregar(grupo: GrupoPanel): void {
    this.codigos.set('');
    this.resultado.set(null);
    this.agregando.set(grupo);
  }

  protected async addMiembros(evento: Event): Promise<void> {
    evento.preventDefault();
    const grupo = this.agregando();
    const codigos = this.codigos()
      .split(/[\s,;]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (!grupo || codigos.length === 0) return;
    this.guardando.set(true);
    try {
      this.resultado.set(await this.api.addMiembros(grupo.id, codigos));
      await this.load();
    } catch (error) {
      this.mensaje.set(getMensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  private async run(trabajo: () => Promise<unknown>): Promise<void> {
    this.mensaje.set(null);
    try {
      await trabajo();
      await this.load();
    } catch (error) {
      this.mensaje.set(getMensajeError(error));
    }
  }

  private async load(): Promise<void> {
    const id = this.eventoId();
    if (!id) return;
    try {
      this.grupos.set(await this.api.list(id));
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
    }
  }
}
