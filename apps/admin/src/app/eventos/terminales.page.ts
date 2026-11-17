import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { canDo } from '@pasitos/dominio';
import { NOMBRES_ESTADO_CONEXION, type EstadoConexion } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  DialogoComponent,
  EncabezadoPaginaComponent,
  getErrorCampo,
  getMensajeError,
  MenuAccionesComponent,
  PanelLateralComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  CuentaRegresivaComponent,
  EstadoComponent,
  QrComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import {
  EventosApi,
  type ConexionTerminal,
  type FilaContenido,
  type TerminalPanel,
} from './eventos-api.service';

type Tipo = 'pantalla' | 'mesa';

const TEXTOS: Readonly<
  Record<Tipo, { titulo: string; nuevo: string; vacio: string; detalle: string }>
> = {
  pantalla: {
    titulo: 'Pantallas',
    nuevo: 'Nueva pantalla',
    vacio: 'Todavía no hay pantallas',
    detalle: 'Cada tablet de una sala o un stand muestra el QR de sus retos.',
  },
  mesa: {
    titulo: 'Mesas',
    nuevo: 'Nueva mesa',
    vacio: 'Todavía no hay mesas',
    detalle: 'En cada mesa de canje se cobran los premios del catálogo.',
  },
};

const VARIANTE_CONEXION: Readonly<Record<EstadoConexion, 'ok' | 'peligro' | 'atenuado'>> = {
  en_linea: 'ok',
  sin_conexion: 'peligro',
  desconectada: 'atenuado',
};

/** Pantallas (O7) y mesas (O5) del evento (HU-209 §5): crear, conectar con QR o enlace, desconectar. */
@Component({
  selector: 'adm-terminales-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    QrComponent,
    TarjetaComponent,
    CuentaRegresivaComponent,
    DialogoComponent,
    EncabezadoPaginaComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
  ],
  template: `
    <pnl-encabezado-pagina [titulo]="textos().titulo" [descripcion]="textos().detalle">
      @if (puedeEditar()) {
        <button type="button" pxBoton (click)="start(null)">{{ textos().nuevo }}</button>
      }
    </pnl-encabezado-pagina>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    <pnl-panel-lateral
      [titulo]="editando() === 'nuevo' ? textos().nuevo : 'Editar'"
      [abierto]="editando() !== null"
      [guardando]="guardando()"
      (guardar)="save($event)"
      (cerrado)="editando.set(null)"
    >
      @if (editando() !== null) {
        <px-campo
          etiqueta="Nombre"
          [ayuda]="tipo() === 'pantalla' ? 'Por ejemplo: Tablet Sala A.' : 'Por ejemplo: Mesa 1.'"
          [error]="errores()['nombre'] ?? null"
          #f1="pxCampo"
        >
          <input
            [id]="f1.idControl"
            [attr.aria-describedby]="f1.idDescripcion"
            maxlength="60"
            [value]="nombre()"
            (input)="nombre.set(valorDe($event))"
          />
        </px-campo>
        <px-campo
          etiqueta="Lugar"
          [opcional]="tipo() === 'mesa'"
          [ayuda]="tipo() === 'pantalla' ? 'Muestra el QR de los retos de este lugar.' : ''"
          [error]="errores()['lugarId'] ?? null"
          #f2="pxCampo"
        >
          <select
            [id]="f2.idControl"
            [attr.aria-describedby]="f2.idDescripcion"
            (change)="lugarId.set(valorDe($event))"
          >
            <option value="">{{ tipo() === 'pantalla' ? 'Elige un lugar' : 'Ninguno' }}</option>
            @for (l of lugares(); track l.id) {
              <option [value]="l.id" [selected]="lugarId() === l.id">{{ l['nombre'] }}</option>
            }
          </select>
        </px-campo>
        @if (tipo() === 'pantalla') {
          <px-campo
            [etiqueta]="editando() === 'nuevo' ? 'PIN de los controles' : 'PIN nuevo'"
            [opcional]="editando() !== 'nuevo'"
            ayuda="4 números. Lo pide la pantalla para sus controles; no se vuelve a mostrar."
            [error]="errores()['pin'] ?? null"
            #f3="pxCampo"
          >
            <input
              [id]="f3.idControl"
              [attr.aria-describedby]="f3.idDescripcion"
              inputmode="numeric"
              autocomplete="off"
              maxlength="4"
              [value]="pin()"
              (input)="pin.set(valorDe($event))"
            />
          </px-campo>
        }
      }
    </pnl-panel-lateral>

    <pnl-dialogo
      [titulo]="'Conectar «' + (conectando()?.terminal?.nombre ?? '') + '»'"
      [abierto]="!!conectando()"
      (cerrado)="close()"
    >
      @if (conectando(); as actual) {
        @if (actual.pideMotivo && !actual.conexion) {
          <px-aviso variante="advertencia">
            Esta pantalla ya está registrada en Stellar. Si conectas otra tablet, se crea una
            pantalla nueva con otro número.
          </px-aviso>
          <form class="flex flex-col gap-4" (submit)="generate($event)" novalidate>
            <px-campo
              etiqueta="Motivo"
              ayuda="Por ejemplo: Se rompió la tablet. De 5 a 300 caracteres."
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
              <button type="submit" pxBoton [cargando]="guardando()">Generar la conexión</button>
            </div>
          </form>
        } @else if (actual.conexion; as conexion) {
          <div class="flex flex-col items-center gap-3 text-center">
            @if (segundosQr() > 0) {
              <px-qr
                [texto]="conexion.qr"
                [tamano]="300"
                descripcion="QR para conectar la tablet"
              />
              <px-cuenta-regresiva [hasta]="venceQr()" />
              <p class="text-muted text-sm">Escanéalo con la cámara de la tablet.</p>
            } @else {
              <p class="font-bold">El QR venció.</p>
              <button type="button" pxBoton (click)="generate(null)">Generar otro</button>
            }
          </div>
          <div class="border-line flex flex-col gap-2 border-t pt-4">
            <p class="font-bold">O con un enlace</p>
            <p class="text-muted text-sm">Vale 24 horas y sirve una vez. Ábrelo en la tablet.</p>
            <div class="flex flex-wrap items-center gap-2">
              <code class="bg-track min-w-0 flex-1 rounded px-2 py-1 text-sm break-all">{{
                conexion.enlace
              }}</code>
              <button type="button" pxBoton="secundario" [chico]="true" (click)="copy(conexion)">
                {{ copiado() ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
          </div>
        } @else {
          <px-estado tipo="cargando" />
        }
      }
      <button pnlPie type="button" pxBoton="secundario" (click)="close()">Listo</button>
    </pnl-dialogo>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado
          tipo="error"
          [titulo]="'No pudimos cargar las ' + textos().titulo.toLowerCase()"
          [traceId]="traceId()"
        />
      }
      @default {
        @for (terminal of terminales(); track terminal.id) {
          <px-tarjeta>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <span>
                <b>{{ terminal.nombre }}</b>
                @if (terminal.numero) {
                  <span class="text-muted"> · n.º {{ terminal.numero }}</span>
                }
                <span class="text-muted block text-sm">
                  {{ terminal.lugar?.nombre ?? 'Sin lugar' }}
                  @if (terminal.conectadaPor && terminal.conectadaAt) {
                    · conectó {{ terminal.conectadaPor.nombre }} el
                    {{ terminal.conectadaAt | date: 'dd/MM HH:mm' }}
                  }
                </span>
                @if (terminal.operadores.length > 0) {
                  <span class="text-muted block text-sm">
                    Operadores: {{ terminal.operadores.join(', ') }}
                  </span>
                }
              </span>
              <span class="flex flex-wrap gap-2">
                <px-chip [variante]="varianteConexion(terminal.conexion)">
                  {{ nombreConexion(terminal.conexion) }}
                </px-chip>
                @if (terminal.registradaEnStellarAt) {
                  <px-chip variante="puntos">En Stellar</px-chip>
                }
              </span>
            </div>
            @if (terminal.reemplazadaPor) {
              <px-aviso class="mt-2" variante="info">
                Reemplazada por «{{ nombreDe(terminal.reemplazadaPor) }}».
              </px-aviso>
            }
            @if (terminal.motivoReemplazo) {
              <p class="mt-2 text-sm">
                Reemplaza a «{{ nombreDe(terminal.reemplazaA) }}». Motivo:
                {{ terminal.motivoReemplazo }}
              </p>
            }
            @if (despuesDelInicio(terminal); as hora) {
              <px-aviso class="mt-2" variante="advertencia">
                Esta pantalla se registró en Stellar después del inicio, a las {{ hora }}.
              </px-aviso>
            }
            @if (puedeEditar() && !terminal.reemplazadaPor) {
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" pxBoton [chico]="true" (click)="openConexion(terminal)">
                  Conectar
                </button>
                <pnl-menu-acciones [etiqueta]="'Acciones de ' + terminal.nombre">
                  <button type="button" (click)="start(terminal)">
                    {{ tipo() === 'pantalla' ? 'Editar o cambiar PIN' : 'Editar' }}
                  </button>
                  @if (terminal.conexion !== 'desconectada') {
                    <hr />
                    <button
                      type="button"
                      class="pnl-acciones__peligro"
                      (click)="disconnect(terminal)"
                    >
                      Desconectar
                    </button>
                  }
                </pnl-menu-acciones>
              </div>
            }
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" [titulo]="textos().vacio">{{ textos().detalle }}</px-estado>
        }
      }
    }
  `,
})
export class TerminalesPage implements OnInit {
  readonly tipo = input<Tipo>('pantalla');
  private readonly api = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  protected readonly textos = computed(() => TEXTOS[this.tipo()]);
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly puedeEditar = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'terminales.update') && e.estado !== 'cerrado';
  });
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly terminales = signal<readonly TerminalPanel[]>([]);
  protected readonly lugares = signal<readonly FilaContenido[]>([]);
  protected readonly editando = signal<'nuevo' | TerminalPanel | null>(null);
  protected readonly nombre = signal('');
  protected readonly lugarId = signal('');
  protected readonly pin = signal('');
  protected readonly motivo = signal('');
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly conectando = signal<{
    terminal: TerminalPanel;
    pideMotivo: boolean;
    conexion: ConexionTerminal | null;
  } | null>(null);
  protected readonly copiado = signal(false);
  private readonly ahora = signal(Date.now());
  protected readonly segundosQr = computed(() => {
    const conexion = this.conectando()?.conexion;
    return conexion
      ? Math.max(0, Math.ceil((new Date(conexion.expiraQrAt).getTime() - this.ahora()) / 1000))
      : 0;
  });
  protected readonly venceQr = computed(
    () => new Date(this.conectando()?.conexion?.expiraQrAt ?? 0),
  );
  protected readonly valorDe = valorDe;

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
    // Cada 30 s, la lista vuelve a ver quién está en línea.
    const refresco = setInterval(() => void this.load(), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(reloj);
      clearInterval(refresco);
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected nombreConexion(estado: EstadoConexion): string {
    return NOMBRES_ESTADO_CONEXION[estado];
  }

  protected varianteConexion(estado: EstadoConexion) {
    return VARIANTE_CONEXION[estado];
  }

  protected nombreDe(id: string | null | undefined): string {
    return this.terminales().find((t) => t.id === id)?.nombre ?? 'otra pantalla';
  }

  /** Registrada en Stellar después de que el evento empezó: su hora, para avisarlo. */
  protected despuesDelInicio(terminal: TerminalPanel): string | null {
    const inicio = this.actual.evento()?.inicioAt;
    const registrada = terminal.registradaEnStellarAt;
    if (!inicio || !registrada || new Date(registrada) <= new Date(inicio)) {
      return null;
    }
    return new Date(registrada).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }

  protected start(terminal: TerminalPanel | null): void {
    this.errores.set({});
    this.editando.set(terminal ?? 'nuevo');
    this.nombre.set(terminal?.nombre ?? '');
    this.lugarId.set(terminal?.lugar?.id ?? '');
    this.pin.set('');
  }

  protected async save(evento: Event): Promise<void> {
    evento.preventDefault();
    const editando = this.editando();
    if (editando === null) return;
    const datos: Record<string, unknown> = {
      nombre: this.nombre().trim(),
      lugarId: this.lugarId() || null,
    };
    if (this.tipo() === 'pantalla' && (editando === 'nuevo' || this.pin())) {
      datos['pin'] = this.pin();
    }
    this.guardando.set(true);
    this.errores.set({});
    try {
      if (editando === 'nuevo') {
        await this.api.createTerminal(this.eventoId(), this.tipo(), datos);
      } else {
        await this.api.updateTerminal(editando.id, this.tipo(), datos);
      }
      this.editando.set(null);
      this.avisos.ok('Guardado.');
      await this.load();
    } catch (error) {
      const campos = ['nombre', 'lugarId', 'pin'];
      this.errores.set(Object.fromEntries(campos.map((c) => [c, getErrorCampo(error, c)])));
      if (campos.every((c) => !getErrorCampo(error, c))) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected openConexion(terminal: TerminalPanel): void {
    this.errores.set({});
    this.motivo.set('');
    this.copiado.set(false);
    const pideMotivo = this.tipo() === 'pantalla' && terminal.registradaEnStellarAt !== null;
    this.conectando.set({ terminal, pideMotivo, conexion: null });
    if (!pideMotivo) {
      void this.generate(null);
    }
  }

  protected async generate(evento: Event | null): Promise<void> {
    evento?.preventDefault();
    const actual = this.conectando();
    if (!actual) return;
    this.guardando.set(true);
    this.errores.set({});
    try {
      const conexion = await this.api.createConexion(
        actual.terminal.id,
        this.tipo(),
        actual.pideMotivo ? this.motivo().trim() : undefined,
      );
      this.copiado.set(false);
      this.conectando.set({ ...actual, conexion });
    } catch (error) {
      this.errores.set({ motivo: getErrorCampo(error, 'motivo') });
      if (!getErrorCampo(error, 'motivo')) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
        this.conectando.set(null);
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async copy(conexion: ConexionTerminal): Promise<void> {
    try {
      await navigator.clipboard.writeText(conexion.enlace);
      this.copiado.set(true);
    } catch {
      this.mensaje.set({ variante: 'peligro', texto: 'No pudimos copiar. Selecciona el enlace.' });
    }
  }

  protected close(): void {
    if (!this.conectando()) return;
    this.conectando.set(null);
    void this.load();
  }

  protected async disconnect(terminal: TerminalPanel): Promise<void> {
    if (!window.confirm(`«${terminal.nombre}» se desconecta al instante. ¿Desconectar?`)) return;
    this.mensaje.set(null);
    try {
      await this.api.disconnectTerminal(terminal.id, this.tipo());
      this.avisos.ok(`Desconectamos «${terminal.nombre}».`);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  private async load(): Promise<void> {
    if (!this.eventoId()) return;
    try {
      const [terminales, lugares] = await Promise.all([
        this.api.listTerminales(this.eventoId(), this.tipo()),
        this.api.listContenido(this.eventoId(), 'lugares'),
      ]);
      this.terminales.set(terminales);
      this.lugares.set(lugares);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
