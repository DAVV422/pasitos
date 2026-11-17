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
  getErrorCampo,
  getMensajeError,
  getUrlArchivo,
  SubidaImagenComponent,
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
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { EventosApi, type PremioPanel } from './eventos-api.service';

interface FormularioPremio {
  nombre: string;
  descripcion: string;
  imagenArchivoId: string | null;
  puntos: string;
  stockTotal: string;
  maxPorPersona: string;
}

const VACIO: FormularioPremio = {
  nombre: '',
  descripcion: '',
  imagenArchivoId: null,
  puntos: '100',
  stockTotal: '20',
  maxPorPersona: '',
};

const CAMPOS = ['nombre', 'descripcion', 'puntos', 'stockTotal', 'maxPorPersona'] as const;

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
    TarjetaComponent,
  ],
  template: `
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-3xl font-extrabold">Catálogo</h1>
      @if (puedeEditar() && editando() === null) {
        <button type="button" pxBoton (click)="start(null)">Nuevo premio</button>
      }
    </header>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }
    @if (sinMesas()) {
      <px-aviso variante="advertencia">
        Tienes premios pero ninguna mesa de canje.
        <a class="underline" [routerLink]="['/eventos', eventoId(), 'mesas']">Crear una mesa</a>
      </px-aviso>
    }

    @if (editando() !== null) {
      <px-tarjeta>
        <h2 class="mb-3 text-xl font-bold">
          {{ editando() === 'nuevo' ? 'Nuevo premio' : 'Editar premio' }}
        </h2>
        <form class="flex flex-col gap-4" (submit)="save($event)" novalidate>
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
          <div class="grid gap-4 md:grid-cols-3">
            <px-campo
              [etiqueta]="'Precio en ' + nombrePuntos()"
              ayuda="Un cambio vale para los canjes siguientes."
              [error]="errores()['puntos'] ?? null"
              #f3="pxCampo"
            >
              <input
                [id]="f3.idControl"
                [attr.aria-describedby]="f3.idDescripcion"
                type="number"
                min="1"
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
          <div class="flex gap-3">
            <button type="submit" pxBoton [cargando]="guardando()">Guardar</button>
            <button type="button" pxBoton="secundario" (click)="editando.set(null)">
              Cancelar
            </button>
          </div>
        </form>
      </px-tarjeta>
    }

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar el catálogo" [traceId]="traceId()" />
      }
      @default {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (premio of premios(); track premio.id) {
            <px-tarjeta>
              @if (premio.imagenArchivoId) {
                <img
                  class="mb-3 aspect-square w-full rounded-lg object-cover"
                  [src]="urlImagen(premio.imagenArchivoId)"
                  alt=""
                  loading="lazy"
                />
              }
              <div class="flex flex-wrap items-start justify-between gap-2">
                <b>{{ premio.nombre }}</b>
                <span class="flex flex-wrap gap-2">
                  @if (premio.estado === 'oculto') {
                    <px-chip variante="atenuado">Oculto</px-chip>
                  } @else if (premio.disponible === 0) {
                    <px-chip variante="peligro">Agotado</px-chip>
                  } @else if (pocos(premio)) {
                    <px-chip variante="puntos">Quedan pocos</px-chip>
                  }
                </span>
              </div>
              <p class="mt-1">{{ premio.puntos }} {{ nombrePuntos() }}</p>
              <p class="text-muted text-sm">
                Disponible: {{ premio.disponible }} de {{ premio.stockTotal }}
                @if (premio.maxPorPersona) {
                  · máximo {{ premio.maxPorPersona }} por persona
                }
              </p>
              @if (premio.stockReservado + premio.stockEntregado > 0) {
                <p class="text-muted text-sm">
                  Reservados: {{ premio.stockReservado }} · Entregados: {{ premio.stockEntregado }}
                </p>
              }
              @if (puedeEditar()) {
                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" pxBoton="secundario" [chico]="true" (click)="start(premio)">
                    Editar
                  </button>
                  <button
                    type="button"
                    pxBoton="secundario"
                    [chico]="true"
                    (click)="toggleVisible(premio)"
                  >
                    {{ premio.estado === 'activo' ? 'Ocultar' : 'Mostrar' }}
                  </button>
                  <button
                    type="button"
                    pxBoton="peligro-contorno"
                    [chico]="true"
                    (click)="remove(premio)"
                  >
                    Borrar
                  </button>
                </div>
              }
            </px-tarjeta>
          } @empty {
            <px-estado tipo="vacio" titulo="Todavía no hay premios"
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

  protected pocos(premio: PremioPanel): boolean {
    return isPocosDisponibles(premio.disponible, premio.stockTotal);
  }

  protected urlImagen(id: string): string {
    return getUrlArchivo(id);
  }

  protected set(campo: Exclude<keyof FormularioPremio, 'imagenArchivoId'>, valor: string): void {
    this.form.set({ ...this.form(), [campo]: valor });
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
      this.mensaje.set({ variante: 'ok', texto: 'Guardado.' });
      setTimeout(() => this.mensaje.set(null), 3_000);
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
      this.premios.set(await this.api.listPremios(this.eventoId()));
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
