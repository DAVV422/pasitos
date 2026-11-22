import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { NOMBRES_ROL, canDo } from '@pasitos/dominio';
import { MODOS_QR, NOMBRES_MODO_QR, ROTACIONES_QR } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getErrorCampo,
  getMensajeError,
  MenuAccionesComponent,
  PanelLateralComponent,
  SeccionComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  TarjetaComponent,
  FechaHoraDirective,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { GruposApi, type GrupoPanel } from './grupos-api.service';
import { EventosApi, type FilaContenido, type RetoPanel } from './eventos-api.service';

const PUBLICADOS = new Set(['publicado', 'en_curso', 'pausado']);

interface FormularioReto {
  nombre: string;
  descripcion: string;
  tipo: 'qr' | 'otorgado' | 'foto';
  modoQr: 'por_tiempo' | 'un_uso';
  rotacionSegundos: string;
  puntos: string;
  topeTotal: string;
  vecesPorPersona: string;
  lugarId: string;
  desde: string;
  hasta: string;
  sponsorId: string;
  grupoId: string;
  // HU-322: la foto.
  instruccionFoto: string;
  permiteGaleria: boolean;
  autorizacionUso: 'opcional' | 'requerida';
  intentosMax: string;
  responsables: readonly string[];
}

const VACIO: FormularioReto = {
  nombre: '',
  descripcion: '',
  tipo: 'qr',
  modoQr: 'por_tiempo',
  rotacionSegundos: '30',
  puntos: '10',
  topeTotal: '100',
  vecesPorPersona: '1',
  lugarId: '',
  desde: '',
  hasta: '',
  sponsorId: '',
  grupoId: '',
  instruccionFoto: '',
  permiteGaleria: true,
  autorizacionUso: 'opcional',
  intentosMax: '3',
  responsables: [],
};

function toLocal(iso: string | null): string {
  return iso ? new Date(new Date(iso).getTime() - 4 * 3_600_000).toISOString().slice(0, 16) : '';
}
function toIso(local: string): string | null {
  return local ? new Date(`${local}:00-04:00`).toISOString() : null;
}

/** Retos (O2, HU-207 §4): lista con el tope consumido y crear o editar en un panel. */
@Component({
  selector: 'adm-retos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    AvisoComponent,
    BotonDirective,
    FechaHoraDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    TarjetaComponent,
    EncabezadoPaginaComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
    SeccionComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Retos"
      descripcion="Lo que la gente hace para ganar puntos: escanear un QR o recibirlos del equipo."
    >
      @if (puedeEditar()) {
        <button type="button" pxBoton (click)="start(null)">Nuevo reto</button>
      }
    </pnl-encabezado-pagina>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    <pnl-panel-lateral
      [titulo]="editando() === 'nuevo' ? 'Nuevo reto' : 'Editar reto'"
      [abierto]="editando() !== null"
      [guardando]="guardando()"
      (guardar)="save($event)"
      (cerrado)="editando.set(null)"
    >
      @if (editando() !== null) {
        <pnl-seccion titulo="Básico">
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
            etiqueta="Cómo se completa"
            [opcional]="true"
            ayuda='Por ejemplo: "Escanea el QR de la pantalla al final de la charla".'
            #f2="pxCampo"
          >
            <textarea
              [id]="f2.idControl"
              [attr.aria-describedby]="f2.idDescripcion"
              rows="2"
              maxlength="500"
              [value]="form().descripcion"
              (input)="set('descripcion', valorDe($event))"
            ></textarea>
          </px-campo>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 font-semibold">Tipo</legend>
            <div class="pnl-opciones">
              <label class="pnl-opcion">
                <input
                  type="radio"
                  name="tipo"
                  [checked]="form().tipo === 'qr'"
                  (change)="set('tipo', 'qr')"
                />
                <span class="pnl-opcion__titulo">Con QR</span>
                <span class="pnl-opcion__detalle"
                  >La persona escanea el QR que muestran las pantallas del lugar del reto.</span
                >
              </label>
              <label class="pnl-opcion">
                <input
                  type="radio"
                  name="tipo"
                  [checked]="form().tipo === 'otorgado'"
                  (change)="set('tipo', 'otorgado')"
                />
                <span class="pnl-opcion__titulo">Otorgado</span>
                <span class="pnl-opcion__detalle"
                  >Sin QR: no aparece en las pantallas. El equipo lo da por cumplido en
                  Ajustes.</span
                >
              </label>
              <label class="pnl-opcion">
                <input
                  type="radio"
                  name="tipo"
                  [checked]="form().tipo === 'foto'"
                  (change)="set('tipo', 'foto')"
                />
                <span class="pnl-opcion__titulo">Con foto</span>
                <span class="pnl-opcion__detalle">
                  La persona manda una foto y el equipo la revisa.
                </span>
              </label>
            </div>
          </fieldset>
        </pnl-seccion>
        @if (form().tipo === 'foto') {
          <pnl-seccion titulo="La foto">
            <px-campo
              etiqueta="Qué foto pedir"
              ayuda="Lo que ve la persona. Por ejemplo: Una foto tuya con la mascota del stand."
              [error]="errores()['instruccionFoto'] ?? null"
              #ff1="pxCampo"
            >
              <input
                [id]="ff1.idControl"
                [attr.aria-describedby]="ff1.idDescripcion"
                maxlength="200"
                [value]="form().instruccionFoto"
                (input)="set('instruccionFoto', valorDe($event))"
              />
            </px-campo>
            <px-campo etiqueta="Desde dónde" #ff2="pxCampo">
              <select
                [id]="ff2.idControl"
                (change)="setFoto('permiteGaleria', valorDe($event) === 'si')"
              >
                <option value="si" [selected]="form().permiteGaleria">Cámara o galería</option>
                <option value="no" [selected]="!form().permiteGaleria">Solo la cámara</option>
              </select>
            </px-campo>
            <px-campo etiqueta="Autorización de uso" #ff3="pxCampo">
              <select
                [id]="ff3.idControl"
                (change)="setFoto('autorizacionUso', $any(valorDe($event)))"
              >
                <option value="opcional" [selected]="form().autorizacionUso === 'opcional'">
                  Opcional: la persona elige
                </option>
                <option value="requerida" [selected]="form().autorizacionUso === 'requerida'">
                  Requerida
                </option>
              </select>
            </px-campo>
            @if (form().autorizacionUso === 'requerida') {
              <px-aviso variante="advertencia">
                Quien no quiera que su foto se use en redes no podrá participar de este reto. Úsalo
                en retos pensados para difusión, y revisa el texto con alguien de lo legal.
              </px-aviso>
            }
            <px-campo
              etiqueta="Intentos"
              ayuda="Cuántas veces puede volver a mandarla si se la rechazan. De 1 a 10."
              [error]="errores()['intentosMax'] ?? null"
              #ff4="pxCampo"
            >
              <input
                [id]="ff4.idControl"
                [attr.aria-describedby]="ff4.idDescripcion"
                type="number"
                min="1"
                max="10"
                [value]="form().intentosMax"
                (input)="set('intentosMax', valorDe($event))"
              />
            </px-campo>
            <fieldset class="flex flex-col gap-2">
              <legend class="mb-1 font-semibold">Quiénes revisan</legend>
              <p class="text-muted text-sm">
                Además del dueño y los coorganizadores. Ven solo las fotos de este reto.
              </p>
              @for (m of revisores(); track m.id) {
                <label class="flex items-center gap-2">
                  <input
                    type="checkbox"
                    [checked]="form().responsables.includes(m.id)"
                    (change)="toggleResponsable(m.id)"
                  />
                  {{ m.nombre }}
                </label>
              } @empty {
                <p class="text-muted text-sm">Invita a alguien en Equipo para asignarlo.</p>
              }
              @if (errores()['responsables']; as e) {
                <p class="text-danger text-sm" role="alert">{{ e }}</p>
              }
            </fieldset>
          </pnl-seccion>
        }
        @if (form().tipo === 'qr') {
          <pnl-seccion titulo="El QR">
            <fieldset class="flex flex-col gap-2">
              <legend class="mb-1 font-semibold">Modo del QR</legend>
              <div class="pnl-opciones">
                @for (modo of modos; track modo) {
                  <label class="pnl-opcion">
                    <input
                      type="radio"
                      name="modo"
                      [checked]="form().modoQr === modo"
                      (change)="set('modoQr', modo)"
                    />
                    <span class="pnl-opcion__titulo">{{ modoTexto(modo).titulo }}</span>
                    <span class="pnl-opcion__detalle">{{ modoTexto(modo).cuando }}</span>
                  </label>
                }
              </div>
            </fieldset>
            @if (form().modoQr === 'por_tiempo') {
              <px-campo etiqueta="Cambia cada" #f3="pxCampo">
                <select
                  [id]="f3.idControl"
                  [attr.aria-describedby]="f3.idDescripcion"
                  (change)="set('rotacionSegundos', valorDe($event))"
                >
                  @for (s of rotaciones; track s) {
                    <option [value]="s" [selected]="form().rotacionSegundos === '' + s">
                      {{ s }} segundos
                    </option>
                  }
                </select>
              </px-campo>
            }
            <px-campo
              etiqueta="Lugar"
              ayuda="Las pantallas de este lugar muestran el QR."
              [error]="errores()['lugarId'] ?? null"
              #f4="pxCampo"
            >
              <select
                [id]="f4.idControl"
                [attr.aria-describedby]="f4.idDescripcion"
                (change)="set('lugarId', valorDe($event))"
              >
                <option value="">Elige un lugar</option>
                @for (l of lugares(); track l.id) {
                  <option [value]="l.id" [selected]="form().lugarId === l.id">
                    {{ l['nombre'] }}
                  </option>
                }
              </select>
            </px-campo>
          </pnl-seccion>
        }
        <pnl-seccion titulo="Recompensa">
          <px-campo
            etiqueta="Puntos"
            ayuda="De 1 a 1000."
            [error]="errores()['puntos'] ?? null"
            #f5="pxCampo"
          >
            <input
              [id]="f5.idControl"
              [attr.aria-describedby]="f5.idDescripcion"
              type="number"
              min="1"
              max="1000"
              [value]="form().puntos"
              (input)="set('puntos', valorDe($event))"
            />
          </px-campo>
          <px-campo
            etiqueta="Tope de participaciones"
            [ayuda]="ayudaTope()"
            [error]="errores()['topeTotal'] ?? null"
            #f6="pxCampo"
          >
            <input
              [id]="f6.idControl"
              [attr.aria-describedby]="f6.idDescripcion"
              type="number"
              min="1"
              max="100000"
              [value]="form().topeTotal"
              (input)="set('topeTotal', valorDe($event))"
            />
          </px-campo>
          <px-campo etiqueta="Veces por persona" #f7="pxCampo">
            <input
              [id]="f7.idControl"
              [attr.aria-describedby]="f7.idDescripcion"
              type="number"
              min="1"
              max="10"
              [value]="form().vecesPorPersona"
              (input)="set('vecesPorPersona', valorDe($event))"
            />
          </px-campo>
        </pnl-seccion>
        <pnl-seccion titulo="Cuándo">
          <div class="grid gap-4 @sm:grid-cols-2">
            <px-campo
              etiqueta="Disponible desde"
              [opcional]="true"
              ayuda="Sin horario: todo el evento."
              [error]="errores()['disponibleDesde'] ?? null"
              #f8="pxCampo"
            >
              <input
                [id]="f8.idControl"
                [attr.aria-describedby]="f8.idDescripcion"
                [pxFechaHora]="form().desde"
                (fechaHora)="set('desde', $event)"
              />
            </px-campo>
            <px-campo
              etiqueta="Hasta"
              [opcional]="true"
              [error]="errores()['disponibleHasta'] ?? null"
              #f9="pxCampo"
            >
              <input
                [id]="f9.idControl"
                [attr.aria-describedby]="f9.idDescripcion"
                [pxFechaHora]="form().hasta"
                (fechaHora)="set('hasta', $event)"
              />
            </px-campo>
          </div>
        </pnl-seccion>
        <pnl-seccion
          titulo="Avanzado"
          [plegable]="true"
          [abierta]="!!form().sponsorId || !!form().grupoId"
        >
          <px-campo
            etiqueta="Sponsor"
            [opcional]="true"
            ayuda="Para el reporte por sponsor."
            #f10="pxCampo"
          >
            <select
              [id]="f10.idControl"
              [attr.aria-describedby]="f10.idDescripcion"
              (change)="set('sponsorId', valorDe($event))"
            >
              <option value="">Ninguno</option>
              @for (s of sponsors(); track s.id) {
                <option [value]="s.id" [selected]="form().sponsorId === s.id">
                  {{ s['nombre'] }}
                </option>
              }
            </select>
          </px-campo>
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
        <px-estado tipo="error" titulo="No pudimos cargar los retos" [traceId]="traceId()" />
      }
      @default {
        @for (reto of retos(); track reto.id) {
          <px-tarjeta>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <span>
                <b>{{ reto.nombre }}</b> · {{ reto.puntos }} {{ nombrePuntos() }}
                @if (nombreGrupo(reto.grupoId); as g) {
                  <px-chip variante="puntos">{{ g }}</px-chip>
                }
                <span class="text-muted block text-sm">
                  {{
                    reto.tipo === 'qr'
                      ? (reto.lugar?.nombre ?? 'Sin lugar')
                      : reto.tipo === 'foto'
                        ? 'Con foto'
                        : reto.tipo === 'verificacion_ci'
                          ? 'Verificación de carnet'
                          : 'Otorgado · sin QR, se da en Ajustes'
                  }}
                  @if (reto.disponibleDesde) {
                    · {{ reto.disponibleDesde | date: 'dd/MM HH:mm' }}–{{
                      reto.disponibleHasta | date: 'HH:mm'
                    }}
                  }
                </span>
              </span>
              <span class="flex flex-wrap items-center gap-2">
                @if (reto.estado === 'desactivado') {
                  <px-chip variante="atenuado">Desactivado</px-chip>
                }
                @if (publicado() && !reto.registradoEnStellar && reto.estado === 'activo') {
                  <px-chip variante="puntos">Registrando en Stellar…</px-chip>
                }
                @if (puedeEditar()) {
                  <pnl-menu-acciones [etiqueta]="'Acciones de ' + reto.nombre">
                    <button type="button" (click)="start(reto)">Editar</button>
                    <button type="button" (click)="toggleActivo(reto)">
                      {{ reto.estado === 'activo' ? 'Desactivar' : 'Activar' }}
                    </button>
                    <hr />
                    <button type="button" class="pnl-acciones__peligro" (click)="remove(reto)">
                      Borrar
                    </button>
                  </pnl-menu-acciones>
                }
              </span>
            </div>
            <div
              class="mt-3"
              [attr.aria-label]="'Tope consumido: ' + reto.entregados + ' de ' + reto.topeTotal"
            >
              <div class="bg-track h-2 w-full rounded-full">
                <div
                  class="bg-points-fill h-2 rounded-full"
                  [style.width.%]="(100 * reto.entregados) / reto.topeTotal"
                ></div>
              </div>
              <p class="text-muted mt-1 text-sm">
                {{ reto.entregados }} de {{ reto.topeTotal }} participaciones
              </p>
            </div>
            @if (reto.tipo === 'qr' && !reto.tienePantalla) {
              <px-aviso class="mt-2" variante="advertencia"
                >Su lugar no tiene pantalla todavía.</px-aviso
              >
            }
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" titulo="Todavía no hay retos"
            >Crea retos para premiar la participación en charlas y stands.</px-estado
          >
        }
      }
    }
  `,
})
export class RetosPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  protected readonly modos = MODOS_QR;
  protected readonly rotaciones = ROTACIONES_QR;
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly nombrePuntos = computed(() => this.actual.evento()?.nombrePuntos ?? 'puntos');
  protected readonly publicado = computed(() => PUBLICADOS.has(this.actual.evento()?.estado ?? ''));
  protected readonly puedeEditar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'contenido.update') && e.estado !== 'cerrado';
  });
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly retos = signal<readonly RetoPanel[]>([]);
  protected readonly lugares = signal<readonly FilaContenido[]>([]);
  protected readonly sponsors = signal<readonly FilaContenido[]>([]);
  protected readonly grupos = signal<readonly GrupoPanel[]>([]);
  /** HU-322: el equipo que puede revisar fotos (los miembros que aceptaron). */
  protected readonly revisores = signal<readonly { id: string; nombre: string }[]>([]);
  private readonly gruposApi = inject(GruposApi);
  protected readonly editando = signal<'nuevo' | RetoPanel | null>(null);
  protected readonly form = signal<FormularioReto>(VACIO);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly ayudaTope = computed(() => {
    const editando = this.editando();
    return this.publicado() && editando && editando !== 'nuevo'
      ? `Solo puede subir. Hoy: ${editando.topeTotal}`
      : 'Cuántas veces se puede completar en total. Va al contrato en Stellar.';
  });
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected modoTexto(modo: (typeof MODOS_QR)[number]) {
    return NOMBRES_MODO_QR[modo];
  }

  protected set(campo: keyof FormularioReto, valor: string): void {
    this.form.set({ ...this.form(), [campo]: valor } as FormularioReto);
  }

  protected setFoto<K extends 'permiteGaleria' | 'autorizacionUso'>(
    campo: K,
    valor: FormularioReto[K],
  ): void {
    this.form.set({ ...this.form(), [campo]: valor });
  }

  protected toggleResponsable(id: string): void {
    const actuales = this.form().responsables;
    this.form.set({
      ...this.form(),
      responsables: actuales.includes(id) ? actuales.filter((r) => r !== id) : [...actuales, id],
    });
  }

  protected start(reto: RetoPanel | null): void {
    this.errores.set({});
    this.editando.set(reto ?? 'nuevo');
    this.form.set(
      reto
        ? {
            nombre: reto.nombre,
            descripcion: reto.descripcion ?? '',
            tipo: reto.tipo === 'verificacion_ci' ? 'otorgado' : reto.tipo,
            modoQr: reto.modoQr,
            rotacionSegundos: String(reto.rotacionSegundos),
            puntos: String(reto.puntos),
            topeTotal: String(reto.topeTotal),
            vecesPorPersona: String(reto.vecesPorPersona),
            lugarId: reto.lugarId ?? '',
            desde: toLocal(reto.disponibleDesde),
            hasta: toLocal(reto.disponibleHasta),
            sponsorId: reto.sponsorId ?? '',
            grupoId: reto.grupoId ?? '',
            instruccionFoto: reto.instruccionFoto ?? '',
            permiteGaleria: reto.permiteGaleria ?? true,
            autorizacionUso: reto.autorizacionUso ?? 'opcional',
            intentosMax: String(reto.intentosMax ?? 3),
            responsables: reto.responsables ?? [],
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
      tipo: f.tipo,
      modoQr: f.modoQr,
      rotacionSegundos: Number(f.rotacionSegundos),
      puntos: Number(f.puntos),
      topeTotal: Number(f.topeTotal),
      vecesPorPersona: Number(f.vecesPorPersona),
      lugarId: f.tipo === 'qr' ? f.lugarId || null : null,
      disponibleDesde: toIso(f.desde),
      disponibleHasta: toIso(f.hasta),
      sponsorId: f.sponsorId || null,
      grupoId: f.grupoId || null,
      ...(f.tipo === 'foto'
        ? {
            instruccionFoto: f.instruccionFoto.trim() || null,
            permiteGaleria: f.permiteGaleria,
            autorizacionUso: f.autorizacionUso,
            intentosMax: Number(f.intentosMax),
            responsables: f.responsables,
          }
        : {}),
    };
    this.guardando.set(true);
    this.errores.set({});
    try {
      if (editando === 'nuevo') {
        await this.api.createReto(this.eventoId(), datos);
      } else {
        await this.api.updateReto(editando.id, datos);
      }
      this.editando.set(null);
      this.avisos.ok('Guardado.');
      await this.load();
    } catch (error) {
      const campos = [
        'nombre',
        'puntos',
        'topeTotal',
        'lugarId',
        'disponibleDesde',
        'disponibleHasta',
      ];
      this.errores.set(Object.fromEntries(campos.map((c) => [c, getErrorCampo(error, c)])));
      if (error instanceof ErrorApi && error.code === 'TOPE_NO_BAJA') {
        this.errores.set({ topeTotal: error.detail });
      } else if (campos.every((c) => !getErrorCampo(error, c))) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async toggleActivo(reto: RetoPanel): Promise<void> {
    await this.run(
      () => this.api.setRetoActivo(reto.id, reto.estado !== 'activo').then(() => undefined),
      null,
    );
  }

  protected async remove(reto: RetoPanel): Promise<void> {
    if (!window.confirm(`¿Borrar el reto «${reto.nombre}»?`)) return;
    await this.run(async () => {
      const { desactivado } = await this.api.deleteReto(reto.id);
      if (desactivado) {
        this.mensaje.set({
          variante: 'ok',
          texto:
            'El evento ya está publicado: el reto quedó desactivado (su número ya está en Stellar).',
        });
      }
    }, null);
  }

  private async run(paso: () => Promise<void>, exito: string | null): Promise<void> {
    this.mensaje.set(null);
    try {
      await paso();
      if (exito) this.avisos.ok(exito);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  protected nombreGrupo(id: string | null): string | null {
    return id ? (this.grupos().find((g) => g.id === id)?.nombre ?? null) : null;
  }

  private async load(): Promise<void> {
    if (!this.eventoId()) return;
    try {
      const [retos, lugares, sponsors, grupos, miembros] = await Promise.all([
        this.api.listRetos(this.eventoId()),
        this.api.listContenido(this.eventoId(), 'lugares'),
        this.api.listContenido(this.eventoId(), 'sponsors'),
        this.gruposApi.list(this.eventoId()),
        this.api.listMiembros(this.eventoId()).catch(() => []),
      ]);
      this.grupos.set(grupos);
      this.revisores.set(
        miembros
          .filter((m) => m.estado === 'activo' && m.rol !== 'coorganizador')
          .map((m) => ({ id: m.id, nombre: `${m.nombre ?? m.email} · ${NOMBRES_ROL[m.rol]}` })),
      );
      this.retos.set(retos);
      this.lugares.set(lugares);
      this.sponsors.set(sponsors);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
