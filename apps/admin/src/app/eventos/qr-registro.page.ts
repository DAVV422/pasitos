import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  canDo,
  NOMBRES_ESTADO_QR_REGISTRO,
  type EstadoQrRegistro,
  type TipoQrRegistro,
} from '@pasitos/dominio';
import {
  AvisosService,
  DialogoComponent,
  SesionService,
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
  FechaHoraDirective,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { GruposApi, type GrupoPanel } from './grupos-api.service';
import { EventosApi, type MiembroEquipo, type TerminalPanel } from './eventos-api.service';
import { QrRegistroApi, type QrRegistroPanel } from './qr-registro-api.service';

/** Bolivia (UTC−4): de ISO a `datetime-local` y de vuelta. */
function toLocal(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() - 4 * 3_600_000).toISOString().slice(0, 16);
}
function toIso(local: string): string | null {
  return local ? new Date(`${local}:00-04:00`).toISOString() : null;
}

interface Formulario {
  nombre: string;
  tipo: TipoQrRegistro;
  muestra: 'miembro' | 'pantalla';
  usuarioId: string;
  pantallaId: string;
  marcaPresente: boolean;
  grupoId: string;
  tope: string;
  desde: string;
  hasta: string;
  riesgo: boolean;
}

const VACIO: Formulario = {
  nombre: '',
  tipo: 'rotativo',
  muestra: 'miembro',
  usuarioId: '',
  pantallaId: '',
  marcaPresente: true,
  grupoId: '',
  tope: '',
  desde: '',
  hasta: '',
  riesgo: false,
};

const VARIANTE_ESTADO: Readonly<
  Record<EstadoQrRegistro, 'ok' | 'peligro' | 'atenuado' | 'puntos'>
> = {
  activo: 'ok',
  invalidado: 'atenuado',
  fuera_de_horario: 'puntos',
  tope_lleno: 'peligro',
};

const CAMPOS = [
  'nombre',
  'usuarioId',
  'pantallaId',
  'grupoId',
  'tope',
  'desde',
  'hasta',
  'muestra',
] as const;

/**
 * QR de registro (HU-319 §5, grupo *Personas*): la gente crea su cuenta escaneándolos. Rotativos
 * (en el celular de alguien del equipo o en una tablet) o fijos (impresos, con su advertencia).
 */
@Component({
  selector: 'adm-qr-registro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    DialogoComponent,
    EncabezadoPaginaComponent,
    EstadoComponent,
    FechaHoraDirective,
    MenuAccionesComponent,
    PanelLateralComponent,
    RouterLink,
    SeccionComponent,
    TarjetaComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="QR de registro"
      descripcion="Con estos QR la gente crea su cuenta del evento en segundos, sin estar en la lista."
    >
      @if (puedeEditar()) {
        <button type="button" pxBoton (click)="start(null)">Nuevo QR</button>
      }
    </pnl-encabezado-pagina>
    @if (mensaje(); as texto) {
      <px-aviso variante="peligro">{{ texto }}</px-aviso>
    }
    @if (!autoregistroActivo()) {
      <px-aviso variante="advertencia">
        El autorregistro está apagado: ningún QR de registro funciona. Actívalo en
        <a class="underline" routerLink="../configuracion">Configuración → Reglas y puerta</a>.
      </px-aviso>
    }

    <pnl-panel-lateral
      [titulo]="editando() === 'nuevo' ? 'Nuevo QR de registro' : 'Editar QR de registro'"
      [abierto]="editando() !== null"
      [guardando]="guardando()"
      (guardar)="save($event)"
      (cerrado)="editando.set(null)"
    >
      @if (editando() !== null) {
        <pnl-seccion titulo="Básico">
          <px-campo
            etiqueta="Nombre"
            ayuda="Para saber de qué QR salió cada cuenta. Por ejemplo: Entrada principal."
            [error]="errores()['nombre'] ?? null"
            #f1="pxCampo"
          >
            <input
              [id]="f1.idControl"
              [attr.aria-describedby]="f1.idDescripcion"
              maxlength="60"
              [value]="form().nombre"
              (input)="set('nombre', valorDe($event))"
            />
          </px-campo>
          @if (editando() === 'nuevo') {
            <fieldset class="flex flex-col gap-2">
              <legend class="mb-1 font-semibold">Tipo</legend>
              <label class="flex items-start gap-2">
                <input
                  type="radio"
                  name="tipo"
                  [checked]="form().tipo === 'rotativo'"
                  (change)="set('tipo', 'rotativo')"
                />
                <span
                  ><b>Rotativo</b>
                  <span class="text-muted block text-sm"
                    >Cambia cada 30 s. Lo muestra alguien del equipo o una tablet.</span
                  ></span
                >
              </label>
              <label class="flex items-start gap-2">
                <input
                  type="radio"
                  name="tipo"
                  [checked]="form().tipo === 'fijo'"
                  (change)="set('tipo', 'fijo')"
                />
                <span
                  ><b>Fijo</b>
                  <span class="text-muted block text-sm">Se imprime. No cambia.</span></span
                >
              </label>
            </fieldset>
          }
        </pnl-seccion>

        @if (form().tipo === 'fijo') {
          @if (editando() === 'nuevo') {
            <px-aviso variante="advertencia">
              <p class="font-bold">Un QR fijo se puede fotografiar y compartir.</p>
              <ul class="mt-1 list-disc pl-5 text-sm">
                <li>
                  Cualquiera que reciba la foto, por WhatsApp o redes, puede crear una cuenta sin
                  estar en el evento.
                </li>
                <li>
                  Una misma persona puede crear varias cuentas desde distintos navegadores, y nadie
                  del equipo la ve.
                </li>
                <li>
                  Las cuentas quedan presentes al instante, si así lo eliges abajo, y pueden ganar
                  los puntos de bienvenida.
                </li>
              </ul>
              <p class="mt-2 text-sm">
                Recomendaciones: pon los puntos de bienvenida en 0, usa un tope para este QR e
                invalídalo si ves registros raros. Para activar cuentas en persona, usa uno
                rotativo.
              </p>
              @if (puntosBienvenida() > 0) {
                <p class="mt-2 text-sm font-semibold">
                  Hoy das {{ puntosBienvenida() }} puntos de bienvenida: con un QR fijo, conviene
                  ponerlos en 0.
                </p>
              }
            </px-aviso>
            <label class="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                [checked]="form().riesgo"
                (change)="set('riesgo', !form().riesgo)"
              />
              Entiendo los riesgos
            </label>
            @if (errores()['riesgo']; as error) {
              <p class="text-danger text-sm" role="alert">{{ error }}</p>
            }
          }
        } @else {
          <pnl-seccion titulo="Dónde">
            <fieldset class="flex flex-col gap-2">
              <legend class="sr-only">Quién lo muestra</legend>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="muestra"
                  [checked]="form().muestra === 'miembro'"
                  (change)="set('muestra', 'miembro')"
                />
                En el celular de alguien del equipo
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="muestra"
                  [checked]="form().muestra === 'pantalla'"
                  (change)="set('muestra', 'pantalla')"
                />
                En una tablet
              </label>
            </fieldset>
            @if (form().muestra === 'miembro') {
              <px-campo
                etiqueta="Persona"
                ayuda="Registradores, coorganizadores o el dueño. Lo abre en Puerta → Activar cuentas."
                [error]="errores()['usuarioId'] ?? null"
                #f2="pxCampo"
              >
                <select
                  [id]="f2.idControl"
                  [attr.aria-describedby]="f2.idDescripcion"
                  (change)="set('usuarioId', valorDe($event))"
                >
                  <option value="">Elige una persona</option>
                  @for (p of personas(); track p.id) {
                    <option [value]="p.id" [selected]="form().usuarioId === p.id">
                      {{ p.nombre }}
                    </option>
                  }
                </select>
              </px-campo>
            } @else {
              <px-campo
                etiqueta="Tablet"
                ayuda="Deja de mostrar los retos y muestra este QR."
                [error]="errores()['pantallaId'] ?? null"
                #f3="pxCampo"
              >
                <select
                  [id]="f3.idControl"
                  [attr.aria-describedby]="f3.idDescripcion"
                  (change)="set('pantallaId', valorDe($event))"
                >
                  <option value="">Elige una tablet</option>
                  @for (t of pantallas(); track t.id) {
                    <option [value]="t.id" [selected]="form().pantallaId === t.id">
                      {{ t.nombre }}
                    </option>
                  }
                </select>
              </px-campo>
            }
          </pnl-seccion>
        }

        <pnl-seccion titulo="Opciones" [plegable]="true" [abierta]="editando() !== 'nuevo'">
          <label class="pnl-interruptor">
            <span class="pnl-interruptor__texto">
              Quedan presentes
              <span class="pnl-interruptor__ayuda">
                Las cuentas de este QR quedan con la asistencia marcada (y la bienvenida).
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              [checked]="form().marcaPresente"
              (change)="set('marcaPresente', !form().marcaPresente)"
            />
          </label>
          <px-campo
            etiqueta="Grupo"
            [opcional]="true"
            ayuda="Quien entra por este QR queda en el grupo (por ejemplo, VIP)."
            [error]="errores()['grupoId'] ?? null"
            #fg="pxCampo"
          >
            <select
              [id]="fg.idControl"
              [attr.aria-describedby]="fg.idDescripcion"
              (change)="set('grupoId', valorDe($event))"
            >
              <option value="">Sin grupo</option>
              @for (g of grupos(); track g.id) {
                <option [value]="g.id" [selected]="form().grupoId === g.id">{{ g.nombre }}</option>
              }
            </select>
          </px-campo>
          <px-campo
            etiqueta="Tope de cuentas"
            [opcional]="true"
            ayuda="Vacío: sin límite. De 1 a 100 000."
            [error]="errores()['tope'] ?? null"
            #f4="pxCampo"
          >
            <input
              [id]="f4.idControl"
              [attr.aria-describedby]="f4.idDescripcion"
              type="number"
              min="1"
              max="100000"
              [value]="form().tope"
              (input)="set('tope', valorDe($event))"
            />
          </px-campo>
          <div class="grid gap-4 @sm:grid-cols-2">
            <px-campo
              etiqueta="Desde"
              [opcional]="true"
              [error]="errores()['desde'] ?? null"
              #f5="pxCampo"
            >
              <input
                [id]="f5.idControl"
                [attr.aria-describedby]="f5.idDescripcion"
                [pxFechaHora]="form().desde"
                (fechaHora)="set('desde', $event)"
              />
            </px-campo>
            <px-campo
              etiqueta="Hasta"
              [opcional]="true"
              [error]="errores()['hasta'] ?? null"
              #f6="pxCampo"
            >
              <input
                [id]="f6.idControl"
                [attr.aria-describedby]="f6.idDescripcion"
                [pxFechaHora]="form().hasta"
                (fechaHora)="set('hasta', $event)"
              />
            </px-campo>
          </div>
        </pnl-seccion>
      }
    </pnl-panel-lateral>

    <pnl-dialogo
      [titulo]="'Invalidar «' + (invalidando()?.nombre ?? '') + '»'"
      [abierto]="!!invalidando()"
      (cerrado)="invalidando.set(null)"
    >
      <form class="flex flex-col gap-4" (submit)="invalidate($event)" novalidate>
        <p>
          El QR deja de funcionar al instante y <b>no se puede deshacer</b>. Las cuentas que ya se
          crearon siguen igual. Para volver a usarlo, crea otro igual.
        </p>
        <px-campo
          etiqueta="Motivo"
          ayuda="Por ejemplo: Lo compartieron en un grupo. De 5 a 300 caracteres."
          [error]="errores()['motivo'] ?? null"
          #fm="pxCampo"
        >
          <textarea
            [id]="fm.idControl"
            [attr.aria-describedby]="fm.idDescripcion"
            rows="2"
            maxlength="300"
            [value]="motivo()"
            (input)="motivo.set(valorDe($event))"
          ></textarea>
        </px-campo>
        <div>
          <button type="submit" pxBoton="peligro" [cargando]="guardando()">Invalidar</button>
        </div>
      </form>
    </pnl-dialogo>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado
          tipo="error"
          titulo="No pudimos cargar los QR de registro"
          [traceId]="traceId()"
        />
      }
      @default {
        @for (qr of qrs(); track qr.id) {
          <px-tarjeta>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <span>
                <b>{{ qr.nombre }}</b>
                <span class="text-muted block text-sm">{{ describeDonde(qr) }}</span>
                <span class="block text-sm">
                  {{ qr.registros }} {{ qr.registros === 1 ? 'cuenta' : 'cuentas' }}
                  @if (qr.tope) {
                    de {{ qr.tope }}
                  }
                  @if (qr.ultimaHora > 0) {
                    · {{ qr.ultimaHora }} en la última hora
                  }
                </span>
                @if (qr.motivoInvalidacion) {
                  <span class="text-muted block text-sm">Motivo: {{ qr.motivoInvalidacion }}</span>
                }
              </span>
              <span class="flex flex-wrap gap-2">
                <px-chip variante="atenuado">{{
                  qr.tipo === 'fijo' ? 'Fijo' : 'Rotativo'
                }}</px-chip>
                <px-chip [variante]="varianteEstado(qr.estado)">{{
                  nombreEstado(qr.estado)
                }}</px-chip>
              </span>
            </div>
            @if (puedeEditar()) {
              <div class="mt-3 flex flex-wrap items-center gap-2">
                @if (qr.tipo === 'fijo' && qr.estado !== 'invalidado') {
                  <button type="button" pxBoton [chico]="true" (click)="download(qr, 'pdf')">
                    Descargar para imprimir
                  </button>
                }
                <pnl-menu-acciones [etiqueta]="'Acciones de ' + qr.nombre">
                  @if (qr.tipo === 'fijo' && qr.estado !== 'invalidado') {
                    <button type="button" (click)="download(qr, 'png')">Descargar en PNG</button>
                  }
                  <a routerLink="../invitados" [queryParams]="{ qr: qr.id }">Ver cuentas</a>
                  @if (qr.estado !== 'invalidado') {
                    <button type="button" (click)="start(qr)">Editar</button>
                  }
                  <button type="button" (click)="duplicate(qr)">Crear otro igual</button>
                  @if (qr.estado !== 'invalidado') {
                    <hr />
                    <button type="button" class="pnl-acciones__peligro" (click)="openInvalidar(qr)">
                      Invalidar
                    </button>
                  }
                </pnl-menu-acciones>
              </div>
            }
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" titulo="Todavía no hay QR de registro">
            Crea uno rotativo para activar cuentas en la puerta, o uno fijo para imprimir.
          </px-estado>
        }
      }
    }
  `,
})
export class QrRegistroPage implements OnInit {
  private readonly api = inject(QrRegistroApi);
  private readonly eventosApi = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);
  private readonly sesion = inject(SesionService);

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly qrs = signal<readonly QrRegistroPanel[]>([]);
  private readonly miembros = signal<readonly MiembroEquipo[]>([]);
  protected readonly pantallas = signal<readonly TerminalPanel[]>([]);
  protected readonly grupos = signal<readonly GrupoPanel[]>([]);
  private readonly gruposApi = inject(GruposApi);
  protected readonly editando = signal<'nuevo' | QrRegistroPanel | null>(null);
  protected readonly form = signal<Formulario>(VACIO);
  protected readonly invalidando = signal<QrRegistroPanel | null>(null);
  protected readonly motivo = signal('');
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<string | null>(null);
  protected readonly valorDe = valorDe;

  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly puedeEditar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'qr_registro.update') && e.estado !== 'cerrado';
  });
  protected readonly autoregistroActivo = computed(
    () => this.actual.evento()?.reglas.autoregistroActivo ?? false,
  );
  protected readonly puntosBienvenida = computed(
    () => this.actual.evento()?.reglas.puntosCheckIn ?? 0,
  );
  /** Quienes pueden mostrar un rotativo: registradores y coorganizadores que ya aceptaron. */
  protected readonly personas = computed(() => {
    const yo = this.sesion.usuario();
    const duena =
      yo && this.actual.evento()?.miRol === 'dueno'
        ? [{ id: yo.id, nombre: `${yo.nombre} · Dueño (tú)` }]
        : [];
    return [
      ...duena,
      ...this.miembros().flatMap((m) =>
        m.usuarioId &&
        m.estado === 'activo' &&
        (m.rol === 'registrador' || m.rol === 'coorganizador')
          ? [
              {
                id: m.usuarioId,
                nombre: `${m.nombre ?? m.email} · ${m.rol === 'registrador' ? 'Registrador' : 'Coorganizador'}`,
              },
            ]
          : [],
      ),
    ];
  });

  ngOnInit(): void {
    void this.load();
  }

  protected set<K extends keyof Formulario>(campo: K, valor: Formulario[K]): void {
    this.form.set({ ...this.form(), [campo]: valor });
  }

  protected nombreEstado(estado: EstadoQrRegistro): string {
    return NOMBRES_ESTADO_QR_REGISTRO[estado];
  }

  protected varianteEstado(estado: EstadoQrRegistro) {
    return VARIANTE_ESTADO[estado];
  }

  protected describeDonde(qr: QrRegistroPanel): string {
    if (qr.muestra === 'impreso') return 'Impreso';
    if (qr.muestra === 'pantalla') return `En la tablet ${qr.pantalla?.nombre ?? ''}`;
    return `En el celular de ${qr.usuario?.nombre ?? 'alguien del equipo'}`;
  }

  protected start(qr: QrRegistroPanel | null): void {
    this.errores.set({});
    this.editando.set(qr ?? 'nuevo');
    this.form.set(
      qr
        ? {
            nombre: qr.nombre,
            tipo: qr.tipo,
            muestra: qr.muestra === 'pantalla' ? 'pantalla' : 'miembro',
            usuarioId: qr.usuario?.id ?? '',
            pantallaId: qr.pantalla?.id ?? '',
            marcaPresente: qr.marcaPresente,
            grupoId: qr.grupoId ?? '',
            tope: qr.tope === null ? '' : String(qr.tope),
            desde: toLocal(qr.desde),
            hasta: toLocal(qr.hasta),
            riesgo: false,
          }
        : VACIO,
    );
  }

  protected async save(evento: Event): Promise<void> {
    evento.preventDefault();
    const editando = this.editando();
    if (editando === null) return;
    const f = this.form();
    if (editando === 'nuevo' && f.tipo === 'fijo' && !f.riesgo) {
      this.errores.set({ riesgo: 'Marca «Entiendo los riesgos» para crear un QR fijo.' });
      return;
    }
    const donde =
      f.tipo === 'fijo'
        ? {}
        : {
            muestra: f.muestra,
            usuarioId: f.muestra === 'miembro' ? f.usuarioId || null : null,
            pantallaId: f.muestra === 'pantalla' ? f.pantallaId || null : null,
          };
    const datos = {
      nombre: f.nombre.trim(),
      ...donde,
      marcaPresente: f.marcaPresente,
      grupoId: f.grupoId || null,
      tope: f.tope.trim() === '' ? null : Number(f.tope),
      desde: toIso(f.desde),
      hasta: toIso(f.hasta),
    };
    this.guardando.set(true);
    this.errores.set({});
    try {
      if (editando === 'nuevo') {
        await this.api.create(this.eventoId(), {
          ...datos,
          tipo: f.tipo,
          ...(f.tipo === 'fijo' ? { confirmarRiesgo: f.riesgo } : {}),
        });
      } else {
        await this.api.update(editando.id, datos);
      }
      this.editando.set(null);
      this.avisos.ok('Guardado.');
      await this.load();
    } catch (error) {
      this.showErrores(error);
    } finally {
      this.guardando.set(false);
    }
  }

  protected openInvalidar(qr: QrRegistroPanel): void {
    this.errores.set({});
    this.motivo.set('');
    this.invalidando.set(qr);
  }

  protected async invalidate(evento: Event): Promise<void> {
    evento.preventDefault();
    const qr = this.invalidando();
    if (!qr) return;
    if (this.motivo().trim().length < 5) {
      this.errores.set({ motivo: 'Cuenta el motivo (al menos 5 letras).' });
      return;
    }
    this.guardando.set(true);
    try {
      await this.api.invalidate(qr.id, this.motivo().trim());
      this.invalidando.set(null);
      this.avisos.ok(`Invalidaste «${qr.nombre}».`);
      await this.load();
    } catch (error) {
      this.mensaje.set(getMensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async duplicate(qr: QrRegistroPanel): Promise<void> {
    try {
      const copia = await this.api.duplicate(qr.id);
      this.avisos.ok(`Creamos «${copia.nombre}».`);
      await this.load();
    } catch (error) {
      this.mensaje.set(getMensajeError(error));
    }
  }

  protected async download(qr: QrRegistroPanel, formato: 'png' | 'pdf'): Promise<void> {
    try {
      const archivo = await this.api.getImprimible(qr.id, formato);
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `qr-registro-${qr.nombre}.${formato}`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      this.mensaje.set(getMensajeError(error));
    }
  }

  private showErrores(error: unknown): void {
    const porCampo = Object.fromEntries(CAMPOS.map((c) => [c, getErrorCampo(error, c)]));
    this.errores.set(porCampo);
    if (CAMPOS.every((c) => !porCampo[c])) this.mensaje.set(getMensajeError(error));
  }

  private async load(): Promise<void> {
    const id = this.eventoId();
    if (!id) return;
    this.mensaje.set(null);
    try {
      const [qrs, miembros, pantallas, grupos] = await Promise.all([
        this.api.list(id),
        this.eventosApi.listMiembros(id),
        this.eventosApi.listTerminales(id, 'pantalla'),
        this.gruposApi.list(id),
      ]);
      this.grupos.set(grupos);
      this.qrs.set(qrs);
      this.miembros.set(miembros);
      this.pantallas.set(pantallas.filter((p) => !p.reemplazadaPor));
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
