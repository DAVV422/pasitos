import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { canDo } from '@pasitos/dominio';
import { isPocosDisponibles } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getErrorCampo,
  getMensajeError,
  getUrlArchivo,
  MenuAccionesComponent,
  PanelLateralComponent,
  SeccionComponent,
  SubidaImagenComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { GruposApi, type GrupoPanel } from './grupos-api.service';
import { EventosApi, type PremioPanel } from './eventos-api.service';

interface FormularioPremio {
  nombre: string;
  descripcion: string;
  imagenArchivoId: string | null;
  puntos: string;
  stockTotal: string;
  maxPorPersona: string;
  grupoId: string;
  requiereCi: boolean;
}

const VACIO: FormularioPremio = {
  nombre: '',
  descripcion: '',
  imagenArchivoId: null,
  puntos: '100',
  stockTotal: '20',
  maxPorPersona: '',
  grupoId: '',
  requiereCi: false,
};

const CAMPOS = [
  'nombre',
  'descripcion',
  'puntos',
  'stockTotal',
  'maxPorPersona',
  'grupoId',
] as const;

/** Catálogo de canje (O5, HU-208 §3): grilla de premios y crear o editar en un panel. */
@Component({
  selector: 'adm-catalogo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    SubidaImagenComponent,
    EncabezadoPaginaComponent,
    IconoComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
    SeccionComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Catálogo"
      descripcion="Los premios que la gente canjea con sus puntos en las mesas de canje."
    >
      @if (puedeEditar()) {
        <button type="button" pxBoton (click)="start(null)">Nuevo premio</button>
      }
    </pnl-encabezado-pagina>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }
    @if (sinMesas()) {
      <px-aviso variante="advertencia">
        Tienes premios pero ninguna mesa de canje.
        <a class="underline" [routerLink]="['/eventos', eventoId(), 'mesas']">Crear una mesa</a>
      </px-aviso>
    }

    <pnl-panel-lateral
      [titulo]="editando() === 'nuevo' ? 'Nuevo premio' : 'Editar premio'"
      [abierto]="editando() !== null"
      [guardando]="guardando()"
      (guardar)="save($event)"
      (cerrado)="editando.set(null)"
    >
      @if (editando() !== null) {
        <px-campo etiqueta="Nombre" [error]="errores()['nombre'] ?? null" #f1="pxCampo">
          <input
            [id]="f1.idControl"
            [attr.aria-describedby]="f1.idDescripcion"
            maxlength="80"
            [value]="form().nombre"
            (input)="set('nombre', valorDe($event))"
          />
        </px-campo>
        <px-campo
          etiqueta="Descripción"
          [opcional]="true"
          [error]="errores()['descripcion'] ?? null"
          #f2="pxCampo"
        >
          <textarea
            [id]="f2.idControl"
            [attr.aria-describedby]="f2.idDescripcion"
            rows="2"
            maxlength="300"
            [value]="form().descripcion"
            (input)="set('descripcion', valorDe($event))"
          ></textarea>
        </px-campo>
        <pnl-subida-imagen
          [eventoId]="eventoId()"
          proposito="imagen_premio"
          etiqueta="Imagen"
          [valor]="form().imagenArchivoId"
          (valorChange)="setImagen($event)"
        />
        <div class="grid gap-4 @sm:grid-cols-2">
          <px-campo
            [etiqueta]="'Precio en ' + nombrePuntos()"
            [ayuda]="
              form().grupoId
                ? 'Con un grupo, el precio puede ser 0: gratis para ' +
                  (nombreGrupo(form().grupoId) ?? 'el grupo') +
                  '.'
                : 'Un cambio vale para los canjes siguientes.'
            "
            [error]="errores()['puntos'] ?? null"
            #f3="pxCampo"
          >
            <input
              [id]="f3.idControl"
              [attr.aria-describedby]="f3.idDescripcion"
              type="number"
              [min]="form().grupoId ? 0 : 1"
              max="100000"
              [value]="form().puntos"
              (input)="set('puntos', valorDe($event))"
            />
          </px-campo>
          <px-campo
            etiqueta="Stock total"
            [ayuda]="ayudaStock()"
            [error]="errores()['stockTotal'] ?? null"
            #f4="pxCampo"
          >
            <input
              [id]="f4.idControl"
              [attr.aria-describedby]="f4.idDescripcion"
              type="number"
              min="0"
              max="100000"
              [value]="form().stockTotal"
              (input)="set('stockTotal', valorDe($event))"
            />
          </px-campo>
          <px-campo
            etiqueta="Máximo por persona"
            [opcional]="true"
            ayuda="Vacío: sin máximo."
            [error]="errores()['maxPorPersona'] ?? null"
            #f5="pxCampo"
          >
            <input
              [id]="f5.idControl"
              [attr.aria-describedby]="f5.idDescripcion"
              type="number"
              min="1"
              max="100"
              [value]="form().maxPorPersona"
              (input)="set('maxPorPersona', valorDe($event))"
            />
          </px-campo>
        </div>
        <pnl-seccion
          titulo="Avanzado"
          [plegable]="true"
          [abierta]="!!form().grupoId || form().requiereCi"
        >
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              [checked]="form().requiereCi"
              (change)="setRequiereCi(!form().requiereCi)"
            />
            Pide el carnet al entregar
          </label>
          <px-campo
            etiqueta="Solo para el grupo"
            [opcional]="true"
            ayuda="Solo lo ven y lo usan las personas de ese grupo."
            [error]="errores()['grupoId'] ?? null"
            #fg="pxCampo"
          >
            <select
              [id]="fg.idControl"
              [attr.aria-describedby]="fg.idDescripcion"
              (change)="set('grupoId', valorDe($event))"
            >
              <option value="">Todo el evento</option>
              @for (g of grupos(); track g.id) {
                <option [value]="g.id" [selected]="form().grupoId === g.id">{{ g.nombre }}</option>
              }
            </select>
          </px-campo>
        </pnl-seccion>
      }
    </pnl-panel-lateral>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar el catálogo" [traceId]="traceId()" />
      }
      @default {
        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          @for (premio of premios(); track premio.id) {
            <article
              class="border-line bg-surface flex flex-col overflow-hidden rounded-xl border"
              [class.opacity-70]="premio.estado === 'oculto'"
            >
              <div class="bg-surface2 relative aspect-[4/3]">
                @if (premio.imagenArchivoId) {
                  <img
                    class="h-full w-full object-cover"
                    [src]="urlImagen(premio.imagenArchivoId)"
                    alt=""
                    loading="lazy"
                  />
                } @else {
                  <span class="text-muted flex h-full items-center justify-center">
                    <px-icono nombre="gift" [tamano]="40" />
                  </span>
                }
                <span class="absolute top-2 left-2 flex flex-wrap gap-2">
                  @if (premio.estado === 'oculto') {
                    <px-chip variante="atenuado">Oculto</px-chip>
                  } @else if (premio.disponible === 0) {
                    <px-chip variante="peligro">Agotado</px-chip>
                  } @else if (pocos(premio)) {
                    <px-chip variante="puntos">Quedan pocos</px-chip>
                  }
                </span>
              </div>
              <div class="flex flex-1 flex-col gap-1 p-4">
                <div class="flex items-start justify-between gap-2">
                  <h2 class="min-w-0 font-bold break-words">{{ premio.nombre }}</h2>
                  @if (puedeEditar()) {
                    <pnl-menu-acciones
                      class="-mt-1 -mr-2"
                      [etiqueta]="'Acciones de ' + premio.nombre"
                    >
                      <button type="button" (click)="start(premio)">Editar</button>
                      <button type="button" (click)="toggleVisible(premio)">
                        {{ premio.estado === 'activo' ? 'Ocultar' : 'Mostrar' }}
                      </button>
                      <hr />
                      <button type="button" class="pnl-acciones__peligro" (click)="remove(premio)">
                        Borrar
                      </button>
                    </pnl-menu-acciones>
                  }
                </div>
                <p class="text-points font-bold">
                  @if (premio.puntos === 0) {
                    Gratis para {{ nombreGrupo(premio.grupoId) ?? 'el grupo' }}
                  } @else {
                    {{ premio.puntos }} {{ nombrePuntos() }}
                  }
                  @if (premio.grupoId && premio.puntos > 0) {
                    <px-chip variante="puntos">{{ nombreGrupo(premio.grupoId) }}</px-chip>
                  }
                </p>
                <p class="text-muted text-sm">
                  Disponible: {{ premio.disponible }} de {{ premio.stockTotal }}
                  @if (premio.maxPorPersona) {
                    · máximo {{ premio.maxPorPersona }} por persona
                  }
                </p>
                @if (premio.stockReservado + premio.stockEntregado > 0) {
                  <p class="text-muted text-sm">
                    Reservados: {{ premio.stockReservado }} · Entregados:
                    {{ premio.stockEntregado }}
                  </p>
                }
              </div>
            </article>
          } @empty {
            <px-estado class="col-span-full" tipo="vacio" titulo="Todavía no hay premios"
              >Carga los productos que se canjean con {{ nombrePuntos() }} en la mesa.</px-estado
            >
          }
        </div>
      }
    }
  `,
})
export class CatalogoPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly gruposApi = inject(GruposApi);
  protected readonly grupos = signal<readonly GrupoPanel[]>([]);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly nombrePuntos = computed(() => this.actual.evento()?.nombrePuntos ?? 'puntos');
  protected readonly puedeEditar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'contenido.update') && e.estado !== 'cerrado';
  });
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly premios = signal<readonly PremioPanel[]>([]);
  protected readonly editando = signal<'nuevo' | PremioPanel | null>(null);
  protected readonly form = signal<FormularioPremio>(VACIO);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{
    variante: 'ok' | 'peligro' | 'info';
    texto: string;
  } | null>(null);
  protected readonly sinMesas = computed(
    () =>
      (this.actual.evento()?.contadores.mesas ?? 0) === 0 &&
      this.premios().some((p) => p.estado === 'activo'),
  );
  protected readonly ayudaStock = computed(() => {
    const editando = this.editando();
    const comprometido =
      editando && editando !== 'nuevo' ? editando.stockReservado + editando.stockEntregado : 0;
    return comprometido > 0
      ? `No puede ser menor que ${comprometido} (reservados y entregados).`
      : 'Cuántas unidades hay para entregar.';
  });
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected nombreGrupo(id: string | null): string | null {
    return id ? (this.grupos().find((g) => g.id === id)?.nombre ?? null) : null;
  }

  protected pocos(premio: PremioPanel): boolean {
    return isPocosDisponibles(premio.disponible, premio.stockTotal);
  }

  protected urlImagen(id: string): string {
    return getUrlArchivo(id);
  }

  protected set(
    campo: Exclude<keyof FormularioPremio, 'imagenArchivoId' | 'requiereCi'>,
    valor: string,
  ): void {
    this.form.set({ ...this.form(), [campo]: valor });
  }

  protected setRequiereCi(valor: boolean): void {
    this.form.set({ ...this.form(), requiereCi: valor });
  }

  protected setImagen(id: string | null): void {
    this.form.set({ ...this.form(), imagenArchivoId: id });
  }

  protected start(premio: PremioPanel | null): void {
    this.errores.set({});
    this.editando.set(premio ?? 'nuevo');
    this.form.set(
      premio
        ? {
            nombre: premio.nombre,
            descripcion: premio.descripcion ?? '',
            imagenArchivoId: premio.imagenArchivoId,
            puntos: String(premio.puntos),
            stockTotal: String(premio.stockTotal),
            maxPorPersona: premio.maxPorPersona === null ? '' : String(premio.maxPorPersona),
            grupoId: premio.grupoId ?? '',
            requiereCi: premio.requiereCi,
          }
        : VACIO,
    );
  }

  protected async save(evento: Event): Promise<void> {
    evento.preventDefault();
    const editando = this.editando();
    if (editando === null) return;
    const f = this.form();
    const datos = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion,
      imagenArchivoId: f.imagenArchivoId,
      puntos: Number(f.puntos),
      stockTotal: Number(f.stockTotal),
      maxPorPersona: f.maxPorPersona.trim() === '' ? null : Number(f.maxPorPersona),
      grupoId: f.grupoId || null,
      requiereCi: f.requiereCi,
    };
    this.guardando.set(true);
    this.errores.set({});
    try {
      if (editando === 'nuevo') {
        await this.api.createPremio(this.eventoId(), datos);
      } else {
        await this.api.updatePremio(editando.id, datos);
      }
      this.editando.set(null);
      this.avisos.ok('Guardado.');
      await this.load();
    } catch (error) {
      this.errores.set(Object.fromEntries(CAMPOS.map((c) => [c, getErrorCampo(error, c)])));
      if (error instanceof ErrorApi && error.code === 'STOCK_MENOR_A_COMPROMETIDO') {
        this.errores.set({ stockTotal: error.detail });
      } else if (CAMPOS.every((c) => !getErrorCampo(error, c))) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async toggleVisible(premio: PremioPanel): Promise<void> {
    await this.run(() =>
      this.api.setPremioVisible(premio.id, premio.estado !== 'activo').then(() => undefined),
    );
  }

  protected async remove(premio: PremioPanel): Promise<void> {
    if (!window.confirm(`¿Borrar el premio «${premio.nombre}»?`)) return;
    await this.run(async () => {
      try {
        await this.api.deletePremio(premio.id);
      } catch (error) {
        if (!(error instanceof ErrorApi && error.code === 'PREMIO_CON_CANJES')) throw error;
        // Ya tuvo canjes: no se borra, se oculta (HU-208 §2).
        if (premio.estado === 'activo') {
          await this.api.setPremioVisible(premio.id, false);
        }
        this.mensaje.set({
          variante: 'info',
          texto: 'Este premio ya tuvo canjes, así que no se borra: quedó oculto.',
        });
      }
    });
  }

  private async run(paso: () => Promise<void>): Promise<void> {
    this.mensaje.set(null);
    try {
      await paso();
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  private async load(): Promise<void> {
    if (!this.eventoId()) return;
    try {
      const [premios, grupos] = await Promise.all([
        this.api.listPremios(this.eventoId()),
        this.gruposApi.list(this.eventoId()),
      ]);
      this.premios.set(premios);
      this.grupos.set(grupos);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
