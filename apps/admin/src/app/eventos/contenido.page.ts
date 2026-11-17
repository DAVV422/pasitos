import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { canDo } from '@pasitos/dominio';
import { NOMBRES_TIPO_LUGAR, TIPOS_LUGAR } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getErrorCampo,
  getMensajeError,
  PanelLateralComponent,
  SubidaImagenComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  TarjetaComponent,
  FechaHoraDirective,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { EventosApi, type FilaContenido } from './eventos-api.service';

type TipoCampo =
  'texto' | 'textarea' | 'numero' | 'tipoLugar' | 'fechaHora' | 'lugar' | 'sponsor' | 'logoSponsor';

interface Campo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: TipoCampo;
  readonly opcional?: boolean;
  readonly ayuda?: string;
}

interface ConfigContenido {
  readonly recurso: 'lugares' | 'actividades' | 'sponsors' | 'preguntas';
  readonly titulo: string;
  readonly singular: string;
  readonly vacio: string;
  readonly campos: readonly Campo[];
  readonly principal: string;
  readonly ordenable: boolean;
}

/** Cada pantalla de contenido (HU-206 §4): qué campos tiene y cómo se lista. */
export const CONTENIDOS: Readonly<Record<string, ConfigContenido>> = {
  lugares: {
    recurso: 'lugares',
    titulo: 'Lugares',
    singular: 'lugar',
    vacio: 'Agrega las salas, los stands, las mesas y los servicios del evento.',
    principal: 'nombre',
    ordenable: false,
    campos: [
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'tipoLugar' },
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
      {
        clave: 'numeroMapa',
        etiqueta: 'Número en el plano',
        tipo: 'numero',
        opcional: true,
        ayuda: 'Del 1 al 99, el que dibujaste en el plano.',
      },
      { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', opcional: true },
    ],
  },
  actividades: {
    recurso: 'actividades',
    titulo: 'Agenda',
    singular: 'actividad',
    vacio: 'Arma la agenda con las charlas, los talleres y las pausas.',
    principal: 'titulo',
    ordenable: false,
    campos: [
      { clave: 'titulo', etiqueta: 'Título', tipo: 'texto' },
      { clave: 'inicioAt', etiqueta: 'Empieza', tipo: 'fechaHora' },
      { clave: 'finAt', etiqueta: 'Termina', tipo: 'fechaHora' },
      { clave: 'lugarId', etiqueta: 'Lugar', tipo: 'lugar', opcional: true },
      { clave: 'expositor', etiqueta: 'Expositor', tipo: 'texto', opcional: true },
      { clave: 'sponsorId', etiqueta: 'Sponsor', tipo: 'sponsor', opcional: true },
      { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', opcional: true },
    ],
  },
  sponsors: {
    recurso: 'sponsors',
    titulo: 'Sponsors',
    singular: 'sponsor',
    vacio: 'Agrega a quienes apoyan el evento.',
    principal: 'nombre',
    ordenable: true,
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
      { clave: 'logoArchivoId', etiqueta: 'Logo', tipo: 'logoSponsor', opcional: true },
      {
        clave: 'enlace',
        etiqueta: 'Enlace',
        tipo: 'texto',
        opcional: true,
        ayuda: 'Tiene que empezar con https://',
      },
      { clave: 'lugarId', etiqueta: 'Su stand', tipo: 'lugar', opcional: true },
      { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', opcional: true },
    ],
  },
  preguntas: {
    recurso: 'preguntas',
    titulo: 'Preguntas frecuentes',
    singular: 'pregunta',
    vacio: 'Responde lo que siempre preguntan: estacionamiento, horarios, qué llevar.',
    principal: 'pregunta',
    ordenable: true,
    campos: [
      { clave: 'pregunta', etiqueta: 'Pregunta', tipo: 'texto' },
      { clave: 'respuesta', etiqueta: 'Respuesta', tipo: 'textarea' },
    ],
  },
};

function toLocal(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  return new Date(new Date(iso).getTime() - 4 * 3_600_000).toISOString().slice(0, 16);
}

/** Lugares, Agenda, Sponsors y Preguntas (O4, HU-206 §4): lista, crear y editar en un panel. */
@Component({
  selector: 'adm-contenido-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    AvisoComponent,
    BotonDirective,
    FechaHoraDirective,
    CampoComponent,
    EstadoComponent,
    TarjetaComponent,
    SubidaImagenComponent,
    EncabezadoPaginaComponent,
    PanelLateralComponent,
  ],
  template: `
    @if (config(); as c) {
      <pnl-encabezado-pagina [titulo]="c.titulo" [descripcion]="c.vacio">
        @if (puedeEditar()) {
          <button type="button" pxBoton (click)="start(null)">Agregar {{ c.singular }}</button>
        }
      </pnl-encabezado-pagina>
      @if (mensaje(); as aviso) {
        <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
      }

      <pnl-panel-lateral
        [titulo]="editando() === 'nuevo' ? 'Nuevo: ' + c.singular : 'Editar ' + c.singular"
        [abierto]="editando() !== null"
        [guardando]="guardando()"
        (guardar)="save($event)"
        (cerrado)="editando.set(null)"
      >
        @if (editando() !== null) {
          @for (campo of c.campos; track campo.clave) {
            @switch (campo.tipo) {
              @case ('logoSponsor') {
                <pnl-subida-imagen
                  [eventoId]="eventoId()"
                  proposito="logo_sponsor"
                  [etiqueta]="campo.etiqueta"
                  [valor]="valorTexto(campo.clave) || null"
                  (valorChange)="set(campo.clave, $event ?? '')"
                />
              }
              @default {
                <px-campo
                  [etiqueta]="campo.etiqueta"
                  [opcional]="!!campo.opcional"
                  [ayuda]="campo.ayuda ?? null"
                  [error]="errores()[campo.clave] ?? null"
                  #pc="pxCampo"
                >
                  @switch (campo.tipo) {
                    @case ('textarea') {
                      <textarea
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        rows="3"
                        [value]="valorTexto(campo.clave)"
                        (input)="set(campo.clave, valorDe($event))"
                      ></textarea>
                    }
                    @case ('tipoLugar') {
                      <select
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        (change)="set(campo.clave, valorDe($event))"
                      >
                        @for (t of tiposLugar; track t) {
                          <option [value]="t" [selected]="valorTexto(campo.clave) === t">
                            {{ nombreTipo(t) }}
                          </option>
                        }
                      </select>
                    }
                    @case ('lugar') {
                      <select
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        (change)="set(campo.clave, valorDe($event))"
                      >
                        <option value="">Ninguno</option>
                        @for (l of lugares(); track l.id) {
                          <option [value]="l.id" [selected]="valorTexto(campo.clave) === l.id">
                            {{ l['nombre'] }}
                          </option>
                        }
                      </select>
                    }
                    @case ('sponsor') {
                      <select
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        (change)="set(campo.clave, valorDe($event))"
                      >
                        <option value="">Ninguno</option>
                        @for (s of sponsorsLista(); track s.id) {
                          <option [value]="s.id" [selected]="valorTexto(campo.clave) === s.id">
                            {{ s['nombre'] }}
                          </option>
                        }
                      </select>
                    }
                    @case ('fechaHora') {
                      <input
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        [pxFechaHora]="valorTexto(campo.clave)"
                        (fechaHora)="set(campo.clave, $event)"
                      />
                    }
                    @case ('numero') {
                      <input
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        type="number"
                        [value]="valorTexto(campo.clave)"
                        (input)="set(campo.clave, valorDe($event))"
                      />
                    }
                    @default {
                      <input
                        [id]="pc.idControl"
                        [attr.aria-describedby]="pc.idDescripcion"
                        [value]="valorTexto(campo.clave)"
                        (input)="set(campo.clave, valorDe($event))"
                      />
                    }
                  }
                </px-campo>
              }
            }
          }
        }
      </pnl-panel-lateral>

      @switch (estado()) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('error') {
          <px-estado
            tipo="error"
            [titulo]="'No pudimos cargar ' + c.titulo.toLowerCase()"
            [traceId]="traceId()"
          />
        }
        @default {
          @for (fila of filas(); track fila.id; let i = $index; let ultimo = $last) {
            <px-tarjeta>
              <div class="flex flex-wrap items-start justify-between gap-2">
                <span>
                  <b>{{ fila[c.principal] }}</b>
                  <span class="text-muted block text-sm">
                    @switch (c.recurso) {
                      @case ('lugares') {
                        {{ nombreTipo(fila['tipo'])
                        }}{{
                          fila['numeroMapa'] ? ' · n.º ' + fila['numeroMapa'] + ' del plano' : ''
                        }}
                      }
                      @case ('actividades') {
                        {{ $any(fila['inicioAt']) | date: 'dd/MM HH:mm' }}–{{
                          $any(fila['finAt']) | date: 'HH:mm'
                        }}{{ nombreLugar(fila['lugarId'])
                        }}{{ fila['expositor'] ? ' · ' + fila['expositor'] : '' }}
                      }
                      @case ('sponsors') {
                        {{ fila['enlace'] ?? '' }}{{ nombreLugar(fila['lugarId']) }}
                      }
                      @case ('preguntas') {
                        {{ fila['respuesta'] }}
                      }
                    }
                  </span>
                </span>
                @if (puedeEditar()) {
                  <span class="flex gap-2">
                    @if (c.ordenable) {
                      <button
                        type="button"
                        pxBoton="secundario"
                        [chico]="true"
                        [deshabilitado]="i === 0"
                        [attr.aria-label]="'Subir ' + fila[c.principal]"
                        (click)="move(i, -1)"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        pxBoton="secundario"
                        [chico]="true"
                        [deshabilitado]="ultimo"
                        [attr.aria-label]="'Bajar ' + fila[c.principal]"
                        (click)="move(i, 1)"
                      >
                        ↓
                      </button>
                    }
                    <button type="button" pxBoton="secundario" [chico]="true" (click)="start(fila)">
                      Editar
                    </button>
                    <button
                      type="button"
                      pxBoton="peligro-contorno"
                      [chico]="true"
                      (click)="remove(fila)"
                    >
                      Borrar
                    </button>
                  </span>
                }
              </div>
            </px-tarjeta>
          } @empty {
            <px-estado tipo="vacio" [titulo]="'Todavía no hay ' + c.titulo.toLowerCase()">{{
              c.vacio
            }}</px-estado>
          }
        }
      }
    }
  `,
})
export class ContenidoPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  /** De la ruta (`data`): `lugares`, `actividades`, `sponsors` o `preguntas`. */
  readonly recurso = input.required<string>();

  protected readonly config = computed(() => CONTENIDOS[this.recurso()]);
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly puedeEditar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'contenido.update') && e.estado !== 'cerrado';
  });
  protected readonly tiposLugar = TIPOS_LUGAR;
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly filas = signal<readonly FilaContenido[]>([]);
  protected readonly lugares = signal<readonly FilaContenido[]>([]);
  protected readonly sponsorsLista = signal<readonly FilaContenido[]>([]);
  protected readonly editando = signal<'nuevo' | string | null>(null);
  protected readonly formulario = signal<Record<string, string>>({});
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected nombreTipo(tipo: unknown): string {
    return NOMBRES_TIPO_LUGAR[tipo as keyof typeof NOMBRES_TIPO_LUGAR] ?? String(tipo);
  }

  protected nombreLugar(id: unknown): string {
    const lugar = this.lugares().find((l) => l.id === id);
    return lugar ? ` · ${String(lugar['nombre'])}` : '';
  }

  protected valorTexto(clave: string): string {
    return this.formulario()[clave] ?? '';
  }

  protected set(clave: string, valor: string): void {
    this.formulario.set({ ...this.formulario(), [clave]: valor });
  }

  protected start(fila: FilaContenido | null): void {
    const c = this.config();
    if (!c) return;
    this.errores.set({});
    this.editando.set(fila ? fila.id : 'nuevo');
    this.formulario.set(
      Object.fromEntries(
        c.campos.map((campo) => {
          const valor = fila?.[campo.clave];
          if (campo.tipo === 'fechaHora') return [campo.clave, toLocal(valor)];
          if (campo.tipo === 'tipoLugar') return [campo.clave, String(valor ?? 'sala')];
          return [campo.clave, valor === null || valor === undefined ? '' : String(valor)];
        }),
      ),
    );
  }

  protected async save(evento: Event): Promise<void> {
    evento.preventDefault();
    const c = this.config();
    const id = this.editando();
    if (!c || id === null) return;
    const datos = Object.fromEntries(
      c.campos.map((campo) => {
        const valor = this.formulario()[campo.clave] ?? '';
        if (campo.tipo === 'numero') return [campo.clave, valor ? Number(valor) : null];
        if (campo.tipo === 'fechaHora')
          return [campo.clave, valor ? new Date(`${valor}:00-04:00`).toISOString() : ''];
        if (['lugar', 'sponsor', 'logoSponsor'].includes(campo.tipo))
          return [campo.clave, valor || null];
        return [campo.clave, valor];
      }),
    );
    this.guardando.set(true);
    this.errores.set({});
    try {
      if (id === 'nuevo') {
        await this.api.createContenido(this.eventoId(), c.recurso, datos);
      } else {
        await this.api.updateContenido(c.recurso, id, datos);
      }
      this.editando.set(null);
      this.avisos.ok('Guardado.');
      await this.load();
    } catch (error) {
      this.errores.set(
        Object.fromEntries(
          c.campos.map((campo) => [campo.clave, getErrorCampo(error, campo.clave)]),
        ),
      );
      if (c.campos.every((campo) => !getErrorCampo(error, campo.clave))) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async remove(fila: FilaContenido): Promise<void> {
    const c = this.config();
    if (!c || !window.confirm(`¿Borrar «${String(fila[c.principal])}»?`)) return;
    try {
      await this.api.deleteContenido(c.recurso, fila.id);
      await this.load();
    } catch (error) {
      const usos =
        error instanceof ErrorApi
          ? (error.meta['usadoPor'] as { nombre: string }[] | undefined)
          : undefined;
      this.mensaje.set({
        variante: 'peligro',
        texto: usos?.length
          ? `${getMensajeError(error)} Lo usa: ${usos.map((u) => u.nombre).join(', ')}.`
          : getMensajeError(error),
      });
    }
  }

  protected async move(indice: number, paso: number): Promise<void> {
    const c = this.config();
    if (!c) return;
    const ids = this.filas().map((f) => f.id);
    const [movido] = ids.splice(indice, 1);
    if (!movido) return;
    ids.splice(indice + paso, 0, movido);
    try {
      this.filas.set(await this.api.reorderContenido(this.eventoId(), c.recurso, ids));
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
  }

  private async load(): Promise<void> {
    const c = this.config();
    if (!c || !this.eventoId()) return;
    try {
      const [filas, lugares, sponsorsLista] = await Promise.all([
        this.api.listContenido(this.eventoId(), c.recurso),
        c.campos.some((campo) => campo.tipo === 'lugar')
          ? this.api.listContenido(this.eventoId(), 'lugares')
          : [],
        c.campos.some((campo) => campo.tipo === 'sponsor')
          ? this.api.listContenido(this.eventoId(), 'sponsors')
          : [],
      ]);
      this.filas.set(filas);
      this.lugares.set(lugares);
      this.sponsorsLista.set(sponsorsLista);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
