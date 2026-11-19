import { ScrollingModule } from '@angular/cdk/scrolling';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import {
  ESTADOS_ASISTENTE,
  ESTADOS_EMAIL,
  NOMBRES_ESTADO_ASISTENTE,
  NOMBRES_ESTADO_EMAIL,
} from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  DialogoComponent,
  EncabezadoPaginaComponent,
  FiltrosComponent,
  getErrorCampo,
  getMensajeError,
  injectEsCelular,
  MenuAccionesComponent,
  PanelLateralComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  QrComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { canDo } from '@pasitos/dominio';
import { EventoActualService } from './evento.layout';
import { GruposApi, type GrupoPanel } from './grupos-api.service';
import {
  EventosApi,
  type AsistentePanel,
  type ContadoresInvitados,
  type EnlaceInvitacion,
  type EstimacionEnvio,
} from './eventos-api.service';
import { ImportacionComponent } from './importacion.component';

interface Candidato {
  readonly codigo: string;
  readonly nombre: string;
  readonly email: string | null;
}

/** La lista de invitados (O6, HU-210 §6). El envío de invitaciones llega con HU-211. */
@Component({
  selector: 'adm-invitados-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ScrollingModule,
    RouterLink,
    QrComponent,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    ImportacionComponent,
    DialogoComponent,
    EncabezadoPaginaComponent,
    FiltrosComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
  ],
  template: `
    <pnl-encabezado-pagina titulo="Invitados">
      <p pnlDetalle class="pnl-pagina__descripcion" aria-live="polite">
        @if (contadores(); as c) {
          {{ c.total }} en la lista · {{ c.presentes }} presentes.
        }
        Agrégalos, mándales su invitación y mira quién llegó.
      </p>
      <button type="button" pxBoton (click)="start(null)">Agregar invitado</button>
      <pnl-menu-acciones texto="Más">
        <button
          type="button"
          [disabled]="enviando() || (estimacion()?.pendientes ?? 0) === 0"
          (click)="send()"
        >
          Enviar invitaciones ({{ estimacion()?.pendientes ?? 0 }} pendientes)
        </button>
        <button type="button" (click)="importando.set(!importando())">Importar CSV</button>
        <button type="button" [disabled]="exportando()" (click)="export()">
          {{ exportando() ? 'Exportando…' : 'Exportar' }}
        </button>
        <hr />
        <button type="button" (click)="downloadEnlaces()">Descargar enlaces</button>
        <a [routerLink]="['/eventos', eventoId(), 'invitados', 'imprimir']">Imprimir tarjetas</a>
      </pnl-menu-acciones>
    </pnl-encabezado-pagina>

    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    @if (importando()) {
      <adm-importacion [eventoId]="eventoId()" (importados)="onImportados($event)" />
    }

    <pnl-dialogo
      [titulo]="tituloEnlace()"
      [abierto]="!!enlaceVisto()"
      (cerrado)="enlaceVisto.set(null)"
    >
      @if (enlaceVisto(); as visto) {
        <div class="flex flex-col items-center gap-3 text-center">
          <px-qr [texto]="visto.enlace" [tamano]="240" descripcion="QR del enlace de invitación" />
          <code class="bg-track rounded px-2 py-1 text-sm break-all">{{ visto.enlace }}</code>
          <p class="text-muted text-sm">El enlace es personal. Verlo queda en la bitácora.</p>
        </div>
      }
      <button pnlPie type="button" pxBoton="secundario" (click)="enlaceVisto.set(null)">
        Listo
      </button>
    </pnl-dialogo>

    <pnl-panel-lateral
      [titulo]="editando() === 'nuevo' ? 'Agregar invitado' : 'Editar invitado'"
      [abierto]="editando() !== null"
      [guardando]="guardando()"
      [textoGuardar]="candidatos().length > 0 ? 'Agregar igual' : 'Guardar'"
      (guardar)="save(null, candidatos().length > 0)"
      (cerrado)="editando.set(null)"
    >
      @if (editando() !== null) {
        <px-campo etiqueta="Nombre" [error]="errores()['nombre'] ?? null" #c1="pxCampo">
          <input
            [id]="c1.idControl"
            [attr.aria-describedby]="c1.idDescripcion"
            maxlength="120"
            autocomplete="off"
            [value]="nombre()"
            (input)="nombre.set(valorDe($event))"
          />
        </px-campo>
        <px-campo
          etiqueta="Correo"
          [opcional]="true"
          ayuda="Para mandarle su invitación."
          [error]="errores()['email'] ?? null"
          #c2="pxCampo"
        >
          <input
            [id]="c2.idControl"
            [attr.aria-describedby]="c2.idDescripcion"
            type="email"
            autocomplete="off"
            [value]="email()"
            (input)="email.set(valorDe($event))"
          />
        </px-campo>
        <px-campo
          etiqueta="Código externo"
          [opcional]="true"
          ayuda="El de tu sistema de entradas, si tienes uno."
          [error]="errores()['codigoExterno'] ?? null"
          #c3="pxCampo"
        >
          <input
            [id]="c3.idControl"
            [attr.aria-describedby]="c3.idDescripcion"
            maxlength="60"
            autocomplete="off"
            [value]="codigoExterno()"
            (input)="codigoExterno.set(valorDe($event))"
          />
        </px-campo>
        @if (candidatos().length > 0) {
          <px-aviso variante="advertencia">
            Hay alguien con un nombre muy parecido en la lista:
            <ul class="mt-1">
              @for (c of candidatos(); track c.codigo) {
                <li>{{ c.codigo }} · {{ c.nombre }}{{ c.email ? ' · ' + c.email : '' }}</li>
              }
            </ul>
            Si es otra persona, toca <b>Agregar igual</b>.
          </px-aviso>
        }
      }
    </pnl-panel-lateral>

    <div class="pnl-chips" role="group" aria-label="Filtrar por estado">
      @for (f of filtrosEstado(); track f.clave) {
        <button
          type="button"
          class="pnl-chip-filtro"
          [attr.aria-pressed]="(filtroEstado() ?? '') === f.clave"
          (click)="setFiltro('estado', f.clave)"
        >
          {{ f.texto }} <span class="pnl-chip-filtro__cuenta">{{ f.cuenta }}</span>
        </button>
      }
    </div>

    <pnl-filtros [activos]="(filtroEmail() ? 1 : 0) + (filtroOrigen() ? 1 : 0)">
      <input
        pnlBuscador
        type="search"
        aria-label="Buscar"
        placeholder="Buscar por nombre (3 letras o más), código o correo"
        [value]="q()"
        (input)="setBusqueda(valorDe($event))"
      />
      <select aria-label="Estado del correo" (change)="setFiltro('emailEstado', valorDe($event))">
        <option value="">Correo: todos</option>
        @for (e of estadosEmail; track e) {
          <option [value]="e">Correo: {{ nombreEstadoEmail(e) }}</option>
        }
      </select>
      <select aria-label="Origen" (change)="setFiltro('origen', valorDe($event))">
        <option value="">Origen: todos</option>
        <option value="lista">Origen: lista</option>
        <option value="csv">Origen: importados</option>
        <option value="puerta">Origen: puerta</option>
        <option value="autoregistro">Origen: autorregistro</option>
      </select>
      @if (grupos().length > 0) {
        <select aria-label="Grupo" (change)="setFiltro('grupoId', valorDe($event))">
          <option value="">Grupo: todos</option>
          @for (g of grupos(); track g.id) {
            <option [value]="g.id">Grupo: {{ g.nombre }}</option>
          }
        </select>
      }
      @if (filtroQr(); as qr) {
        <button type="button" class="pnl-chip-filtro" aria-pressed="true" (click)="clearQr()">
          Solo un QR de registro ✕
        </button>
      }
    </pnl-filtros>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar la lista" [traceId]="traceId()" />
      }
      @default {
        @if (filas().length === 0) {
          @if (contadores()?.total) {
            <px-estado tipo="vacio" titulo="Nadie coincide con la búsqueda">
              Prueba con otro nombre o quita los filtros.
            </px-estado>
          } @else {
            <px-estado tipo="vacio" titulo="Todavía no hay invitados">
              Agrégalos uno por uno o importa tu lista en CSV (en <b>Más</b>).
            </px-estado>
          }
        } @else {
          <!-- Cada fila mide siempre lo mismo (la lista virtual lo necesita): 64 px en
               escritorio y 104 px en el celular, donde la fila es una tarjeta de tres líneas. -->
          <cdk-virtual-scroll-viewport
            [itemSize]="altoFila()"
            class="border-line bg-surface rounded-xl border"
            [style.height.px]="altoLista()"
            (scrolledIndexChange)="onScroll($event)"
          >
            <div
              *cdkVirtualFor="let a of filas(); trackBy: porId"
              class="adm-invitado border-line grid h-[104px] grid-cols-[minmax(0,1fr)_auto] content-center gap-x-3 gap-y-2 border-b px-4 md:h-16 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
            >
              <span class="min-w-0">
                <span class="block truncate">
                  <span class="text-muted">{{ a.codigo }}</span> · <b>{{ a.nombre }}</b>
                </span>
                <span class="text-muted block truncate text-sm">
                  {{ a.email ?? 'Sin correo' }}{{ a.codigoExterno ? ' · ' + a.codigoExterno : ''
                  }}{{ describeOrigen(a) }}
                </span>
              </span>
              <span
                class="col-start-1 row-start-2 flex gap-2 overflow-hidden md:col-start-auto md:row-start-auto"
              >
                <px-chip [variante]="a.estado === 'cancelado' ? 'atenuado' : 'ok'">
                  {{ nombreEstado(a.estado) }}
                </px-chip>
                @for (g of a.grupos ?? []; track g.id) {
                  <px-chip [variante]="$any(g.color)">{{ g.nombre }}</px-chip>
                }
                @if (a.estado !== 'cancelado') {
                  <px-chip [variante]="varianteInvitacion(a)">{{ textoInvitacion(a) }}</px-chip>
                }
              </span>
              <span class="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                @if (a.estado !== 'cancelado') {
                  <pnl-menu-acciones [etiqueta]="'Acciones de ' + a.nombre">
                    <button type="button" (click)="start(a)">Editar</button>
                    @if (a.emailEstado === 'rebotado') {
                      <button type="button" (click)="start(a)">Corregir correo</button>
                    } @else if (a.email && a.invitacion?.estado !== 'usada') {
                      <button type="button" (click)="resend(a)">Reenviar invitación</button>
                    }
                    @if (a.invitacion?.estado !== 'usada') {
                      <button type="button" (click)="view(a)">Ver enlace</button>
                    }
                    @if (puedeGrupos()) {
                      @for (g of grupos(); track g.id) {
                        @if (isEnGrupo(a, g.id)) {
                          <button type="button" (click)="removeDeGrupo(a, g)">
                            Quitar de {{ g.nombre }}
                          </button>
                        } @else {
                          <button type="button" (click)="addAGrupo(a, g)">
                            Agregar a {{ g.nombre }}
                          </button>
                        }
                      }
                    }
                    <hr />
                    <button type="button" class="pnl-acciones__peligro" (click)="cancel(a)">
                      Quitar de la lista
                    </button>
                  </pnl-menu-acciones>
                } @else {
                  <span class="block w-10" aria-hidden="true"></span>
                }
              </span>
            </div>
          </cdk-virtual-scroll-viewport>
        }
      }
    }
  `,
})
export class InvitadosPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly estadosEmail = ESTADOS_EMAIL;
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly filas = signal<readonly AsistentePanel[]>([]);
  protected readonly contadores = signal<ContadoresInvitados | null>(null);
  protected readonly q = signal('');
  private readonly filtros = signal<{
    estado?: string;
    emailEstado?: string;
    origen?: string;
    qrRegistroId?: string;
    grupoId?: string;
  }>({});
  private readonly gruposApi = inject(GruposApi);
  protected readonly grupos = signal<readonly GrupoPanel[]>([]);
  protected readonly puedeGrupos = computed(() => {
    const e = this.actual.evento();
    return !!e && canDo(e.miRol, 'grupos.update') && e.estado !== 'cerrado';
  });
  protected readonly filtroQr = computed(() => this.filtros().qrRegistroId);
  protected readonly filtroEstado = computed(() => this.filtros().estado);
  protected readonly filtroEmail = computed(() => this.filtros().emailEstado);
  protected readonly filtroOrigen = computed(() => this.filtros().origen);
  /** Los contadores, como chips que filtran la lista (Fase 4 de UI). */
  protected readonly filtrosEstado = computed(() => {
    const c = this.contadores();
    return [
      { clave: '', texto: 'Todos', cuenta: c?.total ?? 0 },
      { clave: 'invitado', texto: 'Invitados', cuenta: c?.invitados ?? 0 },
      { clave: 'registrado', texto: 'Registrados', cuenta: c?.registrados ?? 0 },
      { clave: 'presente', texto: 'Presentes', cuenta: c?.presentes ?? 0 },
      { clave: 'cancelado', texto: 'Quitados', cuenta: c?.cancelados ?? 0 },
    ];
  });
  private readonly esCelular = injectEsCelular();
  protected readonly altoFila = computed(() => (this.esCelular() ? 104 : 64));
  /** Hasta 8 filas a la vista (más el borde); con menos, la lista no deja espacio vacío. */
  protected readonly altoLista = computed(
    () => Math.min(this.filas().length, 8) * this.altoFila() + 2,
  );
  private nextCursor: string | null = null;
  private cargandoMas = false;
  private espera: ReturnType<typeof setTimeout> | null = null;

  protected readonly importando = signal(false);
  protected readonly exportando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly estimacion = signal<EstimacionEnvio | null>(null);
  protected readonly enlaceVisto = signal<EnlaceInvitacion | null>(null);
  protected readonly tituloEnlace = computed(() => {
    const visto = this.enlaceVisto();
    return visto ? `${visto.codigo} · ${visto.nombre}` : 'Enlace de invitación';
  });
  protected readonly editando = signal<'nuevo' | AsistentePanel | null>(null);
  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly codigoExterno = signal('');
  protected readonly candidatos = signal<readonly Candidato[]>([]);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{
    variante: 'ok' | 'peligro' | 'info';
    texto: string;
  } | null>(null);
  protected readonly valorDe = valorDe;
  protected readonly porId = (_: number, a: AsistentePanel) => a.id;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.espera) clearTimeout(this.espera);
    });
  }

  ngOnInit(): void {
    // HU-320: *Ver cuentas* de un QR de registro llega con `?qr=`.
    const qr = this.ruta.snapshot.queryParamMap.get('qr');
    if (qr) this.filtros.set({ ...this.filtros(), qrRegistroId: qr });
    void this.load();
    void this.gruposApi
      .list(this.eventoId())
      .then((grupos) => this.grupos.set(grupos))
      .catch(() => this.grupos.set([]));
  }

  protected clearQr(): void {
    const { qrRegistroId, ...resto } = this.filtros();
    void qrRegistroId;
    this.filtros.set(resto);
    void this.load();
  }

  /** *"Puerta · Luis C."* o *"Autorregistro · QR «Entrada principal» · Rita R."*. */
  protected describeOrigen(a: AsistentePanel): string {
    const quien = a.registradoPor ? ` · ${a.registradoPor}` : '';
    if (a.origen === 'puerta') return ` · Puerta${quien}`;
    if (a.origen === 'autoregistro') {
      return ` · Autorregistro${a.qrRegistro ? ` · QR «${a.qrRegistro}»` : ''}${quien}`;
    }
    return '';
  }

  protected nombreEstado(estado: (typeof ESTADOS_ASISTENTE)[number]): string {
    return NOMBRES_ESTADO_ASISTENTE[estado];
  }

  protected nombreEstadoEmail(estado: (typeof ESTADOS_EMAIL)[number]): string {
    return NOMBRES_ESTADO_EMAIL[estado];
  }

  protected setBusqueda(texto: string): void {
    this.q.set(texto);
    if (this.espera) clearTimeout(this.espera);
    // Con 1 o 2 letras no se busca por nombre: espera a la tercera (o a un código exacto).
    this.espera = setTimeout(() => void this.load(), 300);
  }

  protected isEnGrupo(a: AsistentePanel, grupoId: string): boolean {
    return (a.grupos ?? []).some((g) => g.id === grupoId);
  }

  /** HU-325: agregar o quitar del grupo desde la fila. */
  protected async addAGrupo(a: AsistentePanel, grupo: GrupoPanel): Promise<void> {
    try {
      await this.gruposApi.addMiembros(grupo.id, [a.codigo]);
      this.avisos.ok(`${a.nombre} está en ${grupo.nombre}.`);
      await this.load();
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
  }

  protected async removeDeGrupo(a: AsistentePanel, grupo: GrupoPanel): Promise<void> {
    try {
      await this.gruposApi.removeMiembro(grupo.id, a.id);
      this.avisos.ok(`${a.nombre} ya no está en ${grupo.nombre}.`);
      await this.load();
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
  }

  protected setFiltro(campo: 'estado' | 'emailEstado' | 'origen' | 'grupoId', valor: string): void {
    this.filtros.set({ ...this.filtros(), [campo]: valor || undefined });
    void this.load();
  }

  protected onScroll(indice: number): void {
    if (indice > this.filas().length - 20) void this.loadMore();
  }

  protected start(asistente: AsistentePanel | null): void {
    this.errores.set({});
    this.candidatos.set([]);
    this.editando.set(asistente ?? 'nuevo');
    this.nombre.set(asistente?.nombre ?? '');
    this.email.set(asistente?.email ?? '');
    this.codigoExterno.set(asistente?.codigoExterno ?? '');
  }

  protected async save(evento: Event | null, igual: boolean): Promise<void> {
    evento?.preventDefault();
    const editando = this.editando();
    if (editando === null) return;
    const datos = {
      nombre: this.nombre(),
      email: this.email().trim() || null,
      codigoExterno: this.codigoExterno().trim() || null,
      ...(igual ? { confirmarDuplicado: true } : {}),
    };
    this.guardando.set(true);
    this.errores.set({});
    try {
      const guardado =
        editando === 'nuevo'
          ? await this.api.createAsistente(this.eventoId(), datos)
          : await this.api.updateAsistente(editando.id, datos);
      this.editando.set(null);
      this.candidatos.set([]);
      this.avisos.ok(`${guardado.codigo} · ${guardado.nombre}: guardado.`);
      await this.load();
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'ASISTENTE_POSIBLE_DUPLICADO') {
        this.candidatos.set((error.meta['candidatos'] as Candidato[] | undefined) ?? []);
      } else {
        const campos = ['nombre', 'email', 'codigoExterno'];
        this.errores.set(Object.fromEntries(campos.map((c) => [c, getErrorCampo(error, c)])));
        if (campos.every((c) => !getErrorCampo(error, c))) {
          this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
        }
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async cancel(asistente: AsistentePanel): Promise<void> {
    if (!window.confirm(`¿Quitar a ${asistente.nombre} de la lista? No se borra: queda anotado.`)) {
      return;
    }
    try {
      await this.api.cancelAsistente(asistente.id);
      this.avisos.ok(`Quitamos a ${asistente.nombre} de la lista.`);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  protected async onImportados(importados: number): Promise<void> {
    this.importando.set(false);
    this.avisos.ok(`Importamos ${importados} invitados.`);
    await this.load();
  }

  /** La descarga queda en la bitácora (Flujos §4.4). */
  protected async export(): Promise<void> {
    if (!window.confirm('La descarga queda registrada en la bitácora. ¿Exportar la lista?')) return;
    this.exportando.set(true);
    this.mensaje.set(null);
    try {
      const { operacionId } = await this.api.createExportacion(
        this.eventoId(),
        this.filtros().estado,
      );
      for (let intento = 0; intento < 60; intento++) {
        const operacion = await this.api.getOperacion(operacionId);
        if (operacion.descarga) {
          window.location.href = operacion.descarga.url;
          this.avisos.ok('Descargamos la lista.');
          return;
        }
        if (operacion.estado === 'fallida') throw new Error(operacion.error ?? 'Falló');
        await new Promise((r) => setTimeout(r, 1_000));
      }
      this.mensaje.set({
        variante: 'info',
        texto: 'La exportación sigue en curso. Intenta en un rato.',
      });
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    } finally {
      this.exportando.set(false);
    }
  }

  // ── Invitaciones por correo (HU-211 §5) ─────────────────────────────────────

  /** *Sin correo* · *Pendiente* · *En cola (sale el 18/11)* · *Enviada* · *Rebotó* · *Abierta ✓*. */
  protected textoInvitacion(a: AsistentePanel): string {
    if (!a.email) return 'Sin correo';
    if (a.invitacion?.estado === 'usada') return 'Abierta ✓';
    if (a.emailEstado === 'rebotado') return 'Rebotó';
    if (a.emailEstado === 'enviado') return 'Enviada';
    if (a.emailEstado === 'en_cola') {
      const sale = a.invitacion?.saleEl;
      return sale
        ? `En cola (sale el ${new Date(sale).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', timeZone: 'America/La_Paz' })})`
        : 'En cola';
    }
    return 'Pendiente';
  }

  protected varianteInvitacion(a: AsistentePanel): 'ok' | 'peligro' | 'atenuado' | 'puntos' {
    if (a.emailEstado === 'rebotado') return 'peligro';
    if (a.invitacion?.estado === 'usada' || a.emailEstado === 'enviado') return 'ok';
    if (a.emailEstado === 'en_cola') return 'puntos';
    return 'atenuado';
  }

  protected async send(): Promise<void> {
    const e = this.estimacion();
    if (!e || e.pendientes === 0) return;
    const ultima = new Date(e.saleUltimaEl).toLocaleDateString('es-BO', {
      timeZone: 'America/La_Paz',
    });
    const aviso =
      e.diasEstimados > 1
        ? `Se van a enviar ${e.pendientes} invitaciones. Por el límite diario de correos, salen en ${e.diasEstimados} días: la última el ${ultima}. Para que lleguen antes, descarga los enlaces y mándalos por WhatsApp.`
        : `Se van a enviar ${e.pendientes} invitaciones hoy.`;
    if (!window.confirm(aviso)) return;
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      const { encoladas } = await this.api.sendInvitaciones(this.eventoId());
      this.avisos.ok(`Pusimos ${encoladas} invitaciones en la cola.`);
      await this.load();
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    } finally {
      this.enviando.set(false);
    }
  }

  protected async resend(a: AsistentePanel): Promise<void> {
    if (
      !window.confirm(`¿Reenviar la invitación a ${a.nombre}? El enlace anterior deja de servir.`)
    ) {
      return;
    }
    try {
      await this.api.resendInvitacion(a.id);
      this.avisos.ok(`Reenviamos la invitación a ${a.nombre}.`);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  protected async view(a: AsistentePanel): Promise<void> {
    try {
      const [enlace] = await this.api.listEnlaces(this.eventoId(), [a.id]);
      this.enlaceVisto.set(enlace ?? null);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
  }

  protected downloadEnlaces(): void {
    if (
      !window.confirm('Los enlaces dan acceso a cada invitado: la descarga queda en la bitácora.')
    ) {
      return;
    }
    window.location.href = this.api.getUrlEnlacesCsv(this.eventoId());
  }

  private async load(): Promise<void> {
    if (!this.eventoId()) return;
    const q = this.q().trim();
    try {
      const [pagina, contadores, estimacion] = await Promise.all([
        this.api.searchAsistentes(this.eventoId(), { ...this.filtros(), ...(q ? { q } : {}) }),
        this.api.countAsistentes(this.eventoId()),
        this.api.estimateEnvio(this.eventoId()),
      ]);
      this.filas.set(pagina.items);
      this.nextCursor = pagina.pagination.nextCursor;
      this.contadores.set(contadores);
      this.estimacion.set(estimacion);
      this.estado.set('listo');
    } catch (error) {
      // 1 o 2 letras sin coincidencia exacta: no es un error de la pantalla.
      if (error instanceof ErrorApi && error.code === 'VALIDACION' && q.length < 3) {
        this.filas.set([]);
        this.estado.set('listo');
        return;
      }
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }

  private async loadMore(): Promise<void> {
    if (!this.nextCursor || this.cargandoMas) return;
    this.cargandoMas = true;
    try {
      const pagina = await this.api.searchAsistentes(this.eventoId(), {
        ...this.filtros(),
        cursor: this.nextCursor,
      });
      this.filas.set([...this.filas(), ...pagina.items]);
      this.nextCursor = pagina.pagination.nextCursor;
    } finally {
      this.cargandoMas = false;
    }
  }
}
