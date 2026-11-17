import { ScrollingModule } from '@angular/cdk/scrolling';
import { RouterLink } from '@angular/router';
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
import { getErrorCampo, getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  QrComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
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
    TarjetaComponent,
  ],
  template: `
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-3xl font-extrabold">Invitados</h1>
      <span class="flex flex-wrap gap-2">
        <button type="button" pxBoton (click)="start(null)">Agregar invitado</button>
        <button type="button" pxBoton="secundario" (click)="importando.set(!importando())">
          Importar CSV
        </button>
        <button type="button" pxBoton="secundario" [cargando]="exportando()" (click)="export()">
          Exportar
        </button>
      </span>
    </header>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        pxBoton
        [cargando]="enviando()"
        [deshabilitado]="(estimacion()?.pendientes ?? 0) === 0"
        (click)="send()"
      >
        Enviar invitaciones ({{ estimacion()?.pendientes ?? 0 }} pendientes)
      </button>
      <button type="button" pxBoton="secundario" (click)="downloadEnlaces()">
        Descargar enlaces
      </button>
      <a pxBoton="secundario" [routerLink]="['/eventos', eventoId(), 'invitados', 'imprimir']">
        Imprimir tarjetas
      </a>
    </div>
    @if (enlaceVisto(); as visto) {
      <px-tarjeta>
        <div class="flex flex-col items-center gap-3">
          <p>
            <b>{{ visto.codigo }} · {{ visto.nombre }}</b>
          </p>
          <px-qr [texto]="visto.enlace" [tamano]="220" descripcion="QR del enlace de invitación" />
          <code class="bg-track rounded px-2 py-1 text-sm break-all">{{ visto.enlace }}</code>
          <p class="text-muted text-sm">El enlace es personal. Verlo queda en la bitácora.</p>
          <button type="button" pxBoton="secundario" (click)="enlaceVisto.set(null)">Cerrar</button>
        </div>
      </px-tarjeta>
    }
    @if (contadores(); as c) {
      <p class="text-muted" aria-live="polite">
        {{ c.total }} en la lista · {{ c.invitados }} invitados · {{ c.registrados }} registrados ·
        {{ c.presentes }} presentes · {{ c.cancelados }} quitados
      </p>
    }
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    @if (importando()) {
      <adm-importacion [eventoId]="eventoId()" (importados)="onImportados($event)" />
    }

    @if (editando() !== null) {
      <px-tarjeta>
        <h2 class="mb-3 text-xl font-bold">
          {{ editando() === 'nuevo' ? 'Agregar invitado' : 'Editar invitado' }}
        </h2>
        <form class="flex flex-col gap-4" (submit)="save($event, false)" novalidate>
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
            </px-aviso>
            <div class="flex gap-3">
              <button type="button" pxBoton [cargando]="guardando()" (click)="save(null, true)">
                Agregar igual
              </button>
              <button type="button" pxBoton="secundario" (click)="editando.set(null)">
                Cancelar
              </button>
            </div>
          } @else {
            <div class="flex gap-3">
              <button type="submit" pxBoton [cargando]="guardando()">Guardar</button>
              <button type="button" pxBoton="secundario" (click)="editando.set(null)">
                Cancelar
              </button>
            </div>
          }
        </form>
      </px-tarjeta>
    }

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex grow flex-col text-sm">
        Buscar
        <input
          type="search"
          placeholder="Nombre (3 letras o más), código o correo"
          [value]="q()"
          (input)="setBusqueda(valorDe($event))"
        />
      </label>
      <label class="flex flex-col text-sm">
        Estado
        <select (change)="setFiltro('estado', valorDe($event))">
          <option value="">Todos</option>
          @for (e of estados; track e) {
            <option [value]="e">{{ nombreEstado(e) }}</option>
          }
        </select>
      </label>
      <label class="flex flex-col text-sm">
        Correo
        <select (change)="setFiltro('emailEstado', valorDe($event))">
          <option value="">Todos</option>
          @for (e of estadosEmail; track e) {
            <option [value]="e">{{ nombreEstadoEmail(e) }}</option>
          }
        </select>
      </label>
    </div>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar la lista" [traceId]="traceId()" />
      }
      @default {
        @if (filas().length === 0) {
          <px-estado tipo="vacio" titulo="Todavía no hay invitados">
            Agrégalos uno por uno o importa tu lista en CSV.
          </px-estado>
        } @else {
          <cdk-virtual-scroll-viewport
            itemSize="64"
            class="border-line h-96 rounded-lg border"
            (scrolledIndexChange)="onScroll($event)"
          >
            <div
              *cdkVirtualFor="let a of filas(); trackBy: porId"
              class="border-line flex h-16 items-center justify-between gap-2 border-b px-3"
            >
              <span class="min-w-0">
                <span class="text-muted">{{ a.codigo }}</span> · <b>{{ a.nombre }}</b>
                <span class="text-muted block truncate text-sm">
                  {{ a.email ?? 'Sin correo' }}{{ a.codigoExterno ? ' · ' + a.codigoExterno : '' }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <px-chip [variante]="a.estado === 'cancelado' ? 'atenuado' : 'ok'">
                  {{ nombreEstado(a.estado) }}
                </px-chip>
                @if (a.estado !== 'cancelado') {
                  <px-chip [variante]="varianteInvitacion(a)">{{ textoInvitacion(a) }}</px-chip>
                  @if (a.emailEstado === 'rebotado') {
                    <button type="button" pxBoton="secundario" [chico]="true" (click)="start(a)">
                      Corregir correo
                    </button>
                  } @else if (a.email && a.invitacion?.estado !== 'usada') {
                    <button type="button" pxBoton="secundario" [chico]="true" (click)="resend(a)">
                      Reenviar
                    </button>
                  }
                  @if (a.invitacion?.estado !== 'usada') {
                    <button type="button" pxBoton="secundario" [chico]="true" (click)="view(a)">
                      Ver enlace
                    </button>
                  }
                  <button type="button" pxBoton="secundario" [chico]="true" (click)="start(a)">
                    Editar
                  </button>
                  <button
                    type="button"
                    pxBoton="peligro-contorno"
                    [chico]="true"
                    (click)="cancel(a)"
                  >
                    Quitar
                  </button>
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
  private readonly actual = inject(EventoActualService);

  protected readonly estados = ESTADOS_ASISTENTE;
  protected readonly estadosEmail = ESTADOS_EMAIL;
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly filas = signal<readonly AsistentePanel[]>([]);
  protected readonly contadores = signal<ContadoresInvitados | null>(null);
  protected readonly q = signal('');
  private readonly filtros = signal<{ estado?: string; emailEstado?: string }>({});
  private nextCursor: string | null = null;
  private cargandoMas = false;
  private espera: ReturnType<typeof setTimeout> | null = null;

  protected readonly importando = signal(false);
  protected readonly exportando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly estimacion = signal<EstimacionEnvio | null>(null);
  protected readonly enlaceVisto = signal<EnlaceInvitacion | null>(null);
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
    void this.load();
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

  protected setFiltro(campo: 'estado' | 'emailEstado', valor: string): void {
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
      this.mensaje.set({
        variante: 'ok',
        texto: `${guardado.codigo} · ${guardado.nombre}: guardado.`,
      });
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
      this.mensaje.set({ variante: 'ok', texto: `Quitamos a ${asistente.nombre} de la lista.` });
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  protected async onImportados(importados: number): Promise<void> {
    this.importando.set(false);
    this.mensaje.set({ variante: 'ok', texto: `Importamos ${importados} invitados.` });
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
          this.mensaje.set({ variante: 'ok', texto: 'Descargamos la lista.' });
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
      this.mensaje.set({ variante: 'ok', texto: `Pusimos ${encoladas} invitaciones en la cola.` });
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
      this.mensaje.set({ variante: 'ok', texto: `Reenviamos la invitación a ${a.nombre}.` });
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
