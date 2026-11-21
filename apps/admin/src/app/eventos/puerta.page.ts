import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { formatCelular, getEnlaceWhatsapp } from '@pasitos/dominio';
import { ContextoEventoService, DialogoComponent, getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
  LectorQrComponent,
} from '@pasitos/ui';
import { EnVivoService, ErrorApi } from '@pasitos/web-core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccesoPuertaComponent, type AvisoVinculado } from './acceso-puerta.component';
import { EventoActualService } from './evento.layout';
import { FotosAsistenteComponent } from './fotos-asistente.component';
import { RegistroPuertaComponent } from './registro-puerta.component';
import {
  PuertaApi,
  type AlertaPuerta,
  type FichaPuerta,
  type ResultadoBusqueda,
  type ResumenPuerta,
} from './puerta-api.service';

type Modo = 'inicio' | 'escanear' | 'buscar' | 'ficha' | 'acceso' | 'registrar';

const VOLVER_MS = 2_000;
const ESPERA_BUSQUEDA_MS = 250;

/**
 * La vista **Puerta** (HU-301 §5, mockups PU1–PU3), pensada para el celular del registrador:
 * escanear *Mi entrada* o buscar por nombre, ver la ficha y marcar presente. La meta es de unos
 * 5 s por persona: después de marcar, vuelve sola a buscar.
 */
@Component({
  selector: 'adm-puerta-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: '--alto-control: 48px; --alto-boton: 52px; --radio-control: 12px',
  },
  imports: [
    AccesoPuertaComponent,
    FotosAsistenteComponent,
    RegistroPuertaComponent,
    RouterLink,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    DialogoComponent,
    EstadoComponent,
    IconoComponent,
    LectorQrComponent,
  ],
  template: `
    <section class="mx-auto flex w-full max-w-md flex-col gap-4">
      <header class="flex items-center justify-between gap-3">
        <h1 class="text-2xl font-extrabold">Puerta</h1>
        @if (resumen(); as r) {
          <p class="text-muted text-sm" aria-live="polite" data-testid="contador">
            <b class="text-text text-lg">{{ r.presentes }}</b>
            {{ r.presentes === 1 ? 'presente' : 'presentes' }} de {{ r.total }}
          </p>
        }
      </header>
      @if (verificaCi()) {
        <a pxBoton="secundario" routerLink="../carnets">Verificar carnet</a>
      }
      @if (autoregistro()) {
        <!-- HU-319: el QR rotativo asignado a esta persona. -->
        <a pxBoton="secundario" routerLink="activar">Activar cuentas con mi QR</a>
      }
      @if (alertas().length > 0) {
        <section
          class="border-danger flex flex-col gap-2 rounded-xl border-2 p-3"
          aria-labelledby="avisos-no-fui-yo"
        >
          <h2 id="avisos-no-fui-yo" class="text-danger font-bold">Avisos «No fui yo»</h2>
          @for (a of alertas(); track a.id) {
            <div class="flex flex-wrap items-center justify-between gap-2" data-testid="aviso">
              <p class="text-sm">
                <b>{{ a.asistente?.nombre }} · {{ a.asistente?.codigo }}</b> ·
                {{ a.queNoReconoce ?? 'No reconoce algo' }} · {{ hora(a.at) }}
                @if (a.prioridad === 'alta') {
                  <px-chip variante="peligro">Esperando</px-chip>
                }
                @if (a.estado === 'derivada') {
                  <px-chip variante="puntos">Pasado a coorganizador</px-chip>
                }
              </p>
              @if (a.estado === 'atendiendo' && a.atendidaPor && a.id !== alertaActual()?.id) {
                <span class="text-muted text-sm">Lo está atendiendo {{ a.atendidaPor }}</span>
              } @else if (a.estado !== 'derivada' || puedeDeshacer()) {
                <button pxBoton [chico]="true" type="button" (click)="attend(a)">Atender</button>
              }
            </div>
          }
        </section>
      }
      @if (resumen()?.registrosRestantes !== null && resumen()?.registrosRestantes !== undefined) {
        <p class="text-muted text-sm">
          Te quedan {{ resumen()?.registrosRestantes }} registros en la puerta.
        </p>
      }

      @switch (modo()) {
        @case ('registrar') {
          <adm-registro-puerta
            [eventoId]="eventoId()"
            [restantes]="resumen()?.registrosRestantes ?? null"
            (registrada)="onRegistrada($event)"
            (elegida)="open($event)"
            (cancelado)="reset()"
          />
        }
        @case ('acceso') {
          @if (ficha(); as f) {
            <adm-acceso-puerta
              [ficha]="f"
              [zonaHoraria]="zona()"
              [avisoVinculado]="avisoVinculado()"
              [alertaId]="revinculando()"
              (listo)="afterAcceso()"
            />
          }
        }
        @case ('ficha') {
          @if (ficha(); as f) {
            <article class="border-line bg-surface flex flex-col gap-4 rounded-xl border p-5">
              <div>
                <p class="text-muted text-sm">{{ f.codigo }}</p>
                <h2 class="font-display text-4xl leading-tight font-extrabold" data-testid="nombre">
                  {{ f.nombre }}
                </h2>
                @if (f.email) {
                  <p class="text-muted">{{ f.email }}</p>
                }
                @if (f.celular) {
                  <p
                    class="text-muted flex flex-wrap items-center gap-x-3"
                    data-testid="celular-ficha"
                  >
                    {{ mostrarCelular(f.celular) }}
                    @if (f.celular.startsWith('+')) {
                      <!-- HU-411: el número completo solo le llega a D y C. -->
                      <a
                        class="underline"
                        [href]="whatsapp(f.celular)"
                        target="_blank"
                        rel="noopener"
                        >WhatsApp</a
                      >
                      <a class="underline" [href]="'tel:' + f.celular">Llamar</a>
                    }
                  </p>
                }
              </div>
              <div class="flex flex-wrap gap-2">
                <px-chip [variante]="f.estado === 'presente' ? 'ok' : 'atenuado'">{{
                  nombreEstado(f.estado)
                }}</px-chip>
                @for (grupo of f.grupos; track grupo) {
                  <px-chip variante="puntos">{{ grupo }}</px-chip>
                }
              </div>
              @if (f.dispositivo; as d) {
                <p class="text-sm" data-testid="dispositivo">
                  <b>Dispositivo actual:</b> {{ d.modelo }} · desde el {{ fecha(d.desde) }} ·
                  {{ describeMetodo(d.metodo) }}
                </p>
              }
              @if (alertaActual(); as alerta) {
                <div
                  class="bg-surface2 flex flex-col gap-2 rounded-lg p-3"
                  role="group"
                  aria-label="Atender el aviso"
                >
                  <p class="text-danger font-semibold">
                    {{ alerta.queNoReconoce ?? 'No reconoce algo' }}
                    {{ alerta.desde === 'anulado' ? '(desde el celular anulado)' : '' }}
                  </p>
                  <p class="text-sm">Compara el nombre con la persona antes de decidir.</p>
                  <div class="flex flex-wrap gap-2">
                    <button pxBoton [chico]="true" type="button" (click)="revincular(alerta)">
                      Revincular
                    </button>
                    <button
                      pxBoton="secundario"
                      [chico]="true"
                      type="button"
                      (click)="descartando.set(true)"
                    >
                      Descartar
                    </button>
                    @if (esRegistrador()) {
                      <button
                        pxBoton="secundario"
                        [chico]="true"
                        type="button"
                        (click)="derive(alerta)"
                      >
                        Pasar a un coorganizador
                      </button>
                    }
                  </div>
                </div>
              }
              @if (f.historial.length > 0) {
                <details class="text-sm" [open]="alertaActual() !== null">
                  <summary class="cursor-pointer font-semibold">
                    Historial de vinculaciones ({{ f.historial.length }})
                  </summary>
                  <ul class="mt-2 flex flex-col gap-1">
                    @for (h of f.historial; track h.anuladaAt) {
                      <li class="text-muted">
                        {{ h.modelo }} · {{ describeMetodo(h.metodo) }} · anulado el
                        {{ fecha(h.anuladaAt) }}
                        @if (h.motivo) {
                          · {{ h.motivo }}
                        }
                      </li>
                    }
                  </ul>
                </details>
              }
              @if (puedeVerFotos()) {
                <adm-fotos-asistente [asistenteId]="f.id" />
              }
              @if (f.checkIn; as c) {
                <px-aviso variante="ok"
                  >Presente desde las {{ hora(c.at) }}
                  @if (c.por) {
                    · lo marcó {{ c.por }}
                  }
                </px-aviso>
                @if (puedeDeshacer()) {
                  <button pxBoton="secundario" type="button" (click)="deshaciendo.set(true)">
                    Deshacer el check-in
                  </button>
                }
              } @else if (f.estado === 'cancelado') {
                <px-aviso variante="peligro">Esta persona ya no está en la lista.</px-aviso>
              } @else {
                <button
                  pxBoton
                  type="button"
                  class="min-h-16 text-xl"
                  [cargando]="marcando()"
                  (click)="register(f)"
                >
                  <px-icono nombre="check" [tamano]="24" />Marcar presente
                </button>
              }
              @if (f.estado !== 'cancelado') {
                <div class="grid grid-cols-2 gap-2">
                  <button
                    pxBoton="secundario"
                    type="button"
                    data-testid="generar-qr"
                    (click)="setModo('acceso')"
                  >
                    <px-icono nombre="scan" [tamano]="18" />{{
                      f.dispositivo ? 'Generar acceso nuevo' : 'Generar QR de asistente'
                    }}
                  </button>
                  <a
                    pxBoton="secundario"
                    [routerLink]="['/eventos', eventoId(), 'puerta', 'tarjeta', f.id]"
                  >
                    <px-icono nombre="ticket" [tamano]="18" />Imprimir tarjeta
                  </a>
                </div>
              }
              @if (error(); as e) {
                <px-aviso variante="peligro">{{ e }}</px-aviso>
              }
            </article>
            <button pxBoton="secundario" type="button" (click)="reset()">
              <px-icono nombre="back" [tamano]="18" />Volver
            </button>
          }
        }
        @case ('escanear') {
          <px-lector-qr (leido)="onLeido($event)" />
          <p class="text-muted text-center">
            Apunta a <b>Mi entrada</b> en el celular de la persona.
          </p>
          @if (error(); as e) {
            <px-aviso variante="peligro">{{ e }}</px-aviso>
          }
          <button pxBoton="secundario" type="button" (click)="setModo('buscar')">
            <px-icono nombre="search" [tamano]="18" />Buscar por nombre
          </button>
          <button pxBoton="secundario" type="button" (click)="reset()">Cancelar</button>
        }
        @default {
          @if (modo() === 'inicio') {
            <div class="grid grid-cols-2 gap-3">
              <button
                pxBoton
                type="button"
                class="min-h-28 flex-col text-lg"
                (click)="setModo('escanear')"
              >
                <px-icono nombre="scan" [tamano]="32" />Escanear entrada
              </button>
              <button
                pxBoton="secundario"
                type="button"
                class="min-h-28 flex-col text-lg"
                (click)="setModo('buscar')"
              >
                <px-icono nombre="search" [tamano]="32" />Buscar
              </button>
            </div>
          }
          @if (registroAbierto()) {
            <button pxBoton="secundario" type="button" (click)="setModo('registrar')">
              <px-icono nombre="plus" [tamano]="18" />Registrar a alguien nuevo
            </button>
          }
          <px-campo
            #busqueda="pxCampo"
            etiqueta="Nombre, código o correo"
            ayuda="Desde la 3.ª letra."
          >
            <input
              #inputBusqueda
              [id]="busqueda.idControl"
              [attr.aria-describedby]="busqueda.idDescripcion"
              type="search"
              autocomplete="off"
              enterkeyhint="search"
              [value]="consulta()"
              (input)="onConsulta($any($event.target).value)"
              (focus)="setModo('buscar')"
            />
          </px-campo>
          @if (modo() === 'buscar') {
            <button pxBoton="secundario" type="button" (click)="setModo('escanear')">
              <px-icono nombre="scan" [tamano]="18" />Escanear entrada
            </button>
          }
          @if (buscando()) {
            <px-estado tipo="cargando" titulo="Buscando…" />
          } @else if (consulta().trim().length >= 3 && resultados().length === 0) {
            <px-estado tipo="vacio" titulo="No encontramos a nadie con ese nombre." />
          } @else {
            <ul class="flex flex-col gap-2" aria-label="Resultados">
              @for (r of resultados(); track r.id) {
                <li>
                  <button
                    type="button"
                    class="border-line bg-surface flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left"
                    (click)="open(r.id)"
                  >
                    <span class="flex flex-col">
                      <b class="text-lg">{{ r.nombre }}</b>
                      <span class="text-muted text-sm"
                        >{{ r.codigo }}{{ r.email ? ' · ' + r.email : '' }}</span
                      >
                    </span>
                    @if (r.estado === 'presente') {
                      <px-chip variante="ok">Presente</px-chip>
                    }
                  </button>
                </li>
              }
            </ul>
          }
          @if (error(); as e) {
            <px-aviso variante="peligro">{{ e }}</px-aviso>
          }
        }
      }
    </section>

    <pnl-dialogo
      titulo="Descartar el aviso"
      [abierto]="descartando()"
      (cerrado)="descartando.set(false)"
    >
      <px-campo
        #campoNota="pxCampo"
        etiqueta="Nota"
        ayuda="Por ejemplo: reconoce el cambio, era su tablet."
      >
        <textarea
          [id]="campoNota.idControl"
          [attr.aria-describedby]="campoNota.idDescripcion"
          rows="3"
          maxlength="500"
          [value]="nota()"
          (input)="nota.set($any($event.target).value)"
        ></textarea>
      </px-campo>
      <button
        pnlPie
        pxBoton
        type="button"
        [deshabilitado]="nota().trim().length < 5"
        (click)="discard()"
      >
        Descartar
      </button>
    </pnl-dialogo>

    <pnl-dialogo
      titulo="Deshacer el check-in"
      [abierto]="deshaciendo()"
      (cerrado)="deshaciendo.set(false)"
    >
      <p class="mb-3">Se restan los puntos de bienvenida y la persona vuelve a «registrado».</p>
      <px-campo
        #campoMotivo="pxCampo"
        etiqueta="Motivo"
        ayuda="Entre 5 y 300 letras. Queda en la bitácora."
      >
        <textarea
          [id]="campoMotivo.idControl"
          [attr.aria-describedby]="campoMotivo.idDescripcion"
          rows="3"
          maxlength="300"
          [value]="motivo()"
          (input)="motivo.set($any($event.target).value)"
        ></textarea>
      </px-campo>
      <button
        pnlPie
        pxBoton="peligro"
        type="button"
        [deshabilitado]="motivo().trim().length < 5"
        [cargando]="marcando()"
        (click)="undo()"
      >
        Deshacer
      </button>
    </pnl-dialogo>
  `,
})
export class PuertaPage {
  private readonly api = inject(PuertaApi);
  private readonly actual = inject(EventoActualService);
  private readonly contexto = inject(ContextoEventoService);

  protected readonly verificaCi = computed(
    () => this.actual.evento()?.reglas.verificacionCiActiva === true,
  );
  protected readonly autoregistro = computed(
    () => this.actual.evento()?.reglas.autoregistroActivo === true,
  );
  protected readonly modo = signal<Modo>('inicio');
  protected readonly resumen = signal<ResumenPuerta | null>(null);
  protected readonly consulta = signal('');
  protected readonly resultados = signal<readonly ResultadoBusqueda[]>([]);
  protected readonly buscando = signal(false);
  protected readonly ficha = signal<FichaPuerta | null>(null);
  protected readonly marcando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deshaciendo = signal(false);
  protected readonly motivo = signal('');
  /** El último `acceso.vinculado` en vivo, para **Vinculado ✓** (HU-302). */
  protected readonly avisoVinculado = signal<AvisoVinculado | null>(null);
  /** HU-305: los *No fui yo* abiertos, el que se atiende y la nota al descartar. */
  protected readonly alertas = signal<readonly AlertaPuerta[]>([]);
  protected readonly alertaActual = signal<AlertaPuerta | null>(null);
  protected readonly revinculando = signal<string | null>(null);
  protected readonly descartando = signal(false);
  protected readonly nota = signal('');
  protected readonly esRegistrador = computed(() => this.contexto.rol() === 'registrador');
  /** Cómo se llegó a la ficha: el método del check-in. */
  private metodo: 'escaneo_entrada' | 'busqueda' = 'busqueda';
  private esperaBusqueda: ReturnType<typeof setTimeout> | undefined;
  private volver: ReturnType<typeof setTimeout> | undefined;
  private leyendo = false;

  protected readonly puedeDeshacer = computed(() => this.contexto.canDo('puntos.ajustar'));
  /** HU-324: la sección *Fotos* de la ficha, para dueño y coorganizador. */
  protected readonly puedeVerFotos = computed(() => this.contexto.canDo('bitacora.read'));
  /** HU-303: con el registro activo y cupo. */
  protected readonly registroAbierto = computed(
    () =>
      this.actual.evento()?.reglas.registroPuertaActivo !== false &&
      this.resumen()?.registrosRestantes !== 0,
  );
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly zona = computed(() => this.actual.evento()?.zonaHoraria ?? 'America/La_Paz');

  constructor() {
    void this.loadResumen();
    void this.loadAlertas();
    // HU-318: *Ver persona* desde Alertas abre su ficha.
    const asistente = inject(ActivatedRoute).snapshot.queryParamMap.get('asistente');
    if (asistente) void this.open(asistente);
    const canal = inject(EnVivoService).connect(
      `/api/v1/eventos/${this.eventoId()}/en-vivo`,
      [
        'asistencia.registrada',
        'asistencia.anulada',
        'alerta.creada',
        'alerta.actualizada',
        'acceso.vinculado',
      ],
      inject(DestroyRef),
    );
    for (const tipo of [
      'asistencia.registrada',
      'asistencia.anulada',
      'alerta.creada',
      'reiniciar',
    ]) {
      canal.on(tipo, () => void this.loadResumen());
    }
    for (const tipo of ['alerta.creada', 'alerta.actualizada', 'reiniciar']) {
      canal.on(tipo, () => void this.loadAlertas());
    }
    canal.on('acceso.vinculado', (aviso) => {
      const datos = aviso.datos as Partial<AvisoVinculado> | null;
      if (datos?.accesoId && datos.modelo && datos.hora) {
        this.avisoVinculado.set({
          accesoId: datos.accesoId,
          modelo: datos.modelo,
          hora: datos.hora,
        });
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.esperaBusqueda);
      clearTimeout(this.volver);
    });
  }

  /** HU-411: el oculto (`•••• 4567`) tal cual; el completo, con espacios. */
  protected readonly whatsapp = getEnlaceWhatsapp;

  protected mostrarCelular(celular: string): string {
    return celular.startsWith('+') ? (formatCelular(celular) ?? celular) : celular;
  }

  protected setModo(modo: Modo): void {
    this.error.set(null);
    this.modo.set(modo);
    if (modo === 'buscar') {
      queueMicrotask(() =>
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
      );
    }
  }

  protected reset(): void {
    clearTimeout(this.volver);
    this.alertaActual.set(null);
    this.revinculando.set(null);
    this.ficha.set(null);
    this.error.set(null);
    this.consulta.set('');
    this.resultados.set([]);
    this.modo.set('inicio');
  }

  protected onConsulta(valor: string): void {
    this.consulta.set(valor);
    clearTimeout(this.esperaBusqueda);
    const q = valor.trim();
    if (q.length < 3) {
      this.resultados.set([]);
      return;
    }
    this.esperaBusqueda = setTimeout(() => void this.search(q), ESPERA_BUSQUEDA_MS);
  }

  protected async onLeido(texto: string): Promise<void> {
    if (this.leyendo) return;
    this.leyendo = true;
    this.error.set(null);
    try {
      this.metodo = 'escaneo_entrada';
      this.ficha.set(await this.api.scanEntrada(this.eventoId(), texto));
      this.modo.set('ficha');
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.leyendo = false;
    }
  }

  /** Tomar el aviso: se abre la ficha con el historial de dispositivos a la vista. */
  protected async attend(alerta: AlertaPuerta): Promise<void> {
    this.error.set(null);
    try {
      await this.api.attendAlerta(alerta.id);
      this.alertaActual.set(alerta);
      if (alerta.asistente) {
        this.ficha.set(await this.api.getFicha(alerta.asistente.id));
        this.modo.set('ficha');
      }
      void this.loadAlertas();
    } catch (error) {
      this.error.set(getMensajeError(error));
      void this.loadAlertas();
    }
  }

  /** Revincular: el acceso nuevo con el motivo ya elegido; el aviso se cierra al vincular. */
  protected async revincular(alerta: AlertaPuerta): Promise<void> {
    try {
      await this.api.resolveAlerta(alerta.id, { resolucion: 'revincular' });
      this.revinculando.set(alerta.id);
      this.modo.set('acceso');
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected async discard(): Promise<void> {
    const alerta = this.alertaActual();
    if (!alerta) return;
    try {
      await this.api.resolveAlerta(alerta.id, {
        resolucion: 'descartar',
        nota: this.nota().trim(),
      });
      this.descartando.set(false);
      this.nota.set('');
      this.alertaActual.set(null);
      void this.loadAlertas();
    } catch (error) {
      this.descartando.set(false);
      this.error.set(getMensajeError(error));
    }
  }

  protected async derive(alerta: AlertaPuerta): Promise<void> {
    try {
      await this.api.resolveAlerta(alerta.id, { resolucion: 'derivar' });
      this.alertaActual.set(null);
      void this.loadAlertas();
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected afterAcceso(): void {
    this.reset();
    void this.loadAlertas();
  }

  private async loadAlertas(): Promise<void> {
    if (!this.eventoId()) return;
    this.alertas.set(await this.api.listAlertas(this.eventoId()).catch(() => this.alertas()));
  }

  /** La persona nueva ya está presente: su ficha, con *Generar QR de asistente* a mano. */
  protected onRegistrada(ficha: FichaPuerta): void {
    this.ficha.set(ficha);
    this.modo.set('ficha');
    void this.loadResumen();
    queueMicrotask(() =>
      document.querySelector<HTMLElement>('[data-testid="generar-qr"]')?.focus(),
    );
  }

  protected async open(asistenteId: string): Promise<void> {
    this.error.set(null);
    try {
      this.metodo = 'busqueda';
      this.ficha.set(await this.api.getFicha(asistenteId));
      this.modo.set('ficha');
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected async register(ficha: FichaPuerta): Promise<void> {
    if (this.marcando()) return;
    this.marcando.set(true);
    this.error.set(null);
    try {
      const actualizada = await this.api.register(ficha.id, this.metodo);
      this.ficha.set(actualizada);
      this.bumpPresentes(1);
      // Si ya tiene su celular vinculado, vuelve sola a buscar: la fila sigue.
      // Si no tiene celular vinculado, deja la ficha abierta para generar su QR de asistente.
      if (actualizada.dispositivo) {
        this.volver = setTimeout(() => this.reset(), VOLVER_MS);
      }
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'CHECK_IN_YA_HECHO') {
        this.ficha.set(await this.api.getFicha(ficha.id).catch(() => ficha));
      } else {
        this.error.set(getMensajeError(error));
      }
    } finally {
      this.marcando.set(false);
    }
  }

  protected async undo(): Promise<void> {
    const ficha = this.ficha();
    if (!ficha || this.marcando()) return;
    this.marcando.set(true);
    try {
      this.ficha.set(await this.api.undo(ficha.id, this.motivo().trim()));
      this.bumpPresentes(-1);
      this.deshaciendo.set(false);
      this.motivo.set('');
    } catch (error) {
      this.deshaciendo.set(false);
      this.error.set(getMensajeError(error));
    } finally {
      this.marcando.set(false);
    }
  }

  protected nombreEstado(estado: string): string {
    return (
      {
        invitado: 'Invitado',
        registrado: 'Registrado',
        presente: 'Presente',
        cancelado: 'Quitado',
      }[estado] ?? estado
    );
  }

  /** *"21/11 a las 09:15"*. */
  protected fecha(iso: string): string {
    const dia = new Intl.DateTimeFormat('es-BO', {
      day: '2-digit',
      month: '2-digit',
      timeZone: this.zona(),
    }).format(new Date(iso));
    return `${dia} a las ${this.hora(iso)}`;
  }

  protected describeMetodo(metodo: string): string {
    return (
      {
        enlace: 'por el enlace del correo',
        qr_puerta: 'con el QR de la puerta',
        enlace_corto: 'con el enlace corto',
        autoregistro: 'por autorregistro',
      }[metodo] ?? metodo
    );
  }

  protected hora(fecha: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.actual.evento()?.zonaHoraria ?? 'America/La_Paz',
    }).format(new Date(fecha));
  }

  private async search(q: string): Promise<void> {
    this.buscando.set(true);
    try {
      const resultados = await this.api.search(this.eventoId(), q);
      if (this.consulta().trim() === q) this.resultados.set(resultados);
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.buscando.set(false);
    }
  }

  private async loadResumen(): Promise<void> {
    if (!this.eventoId()) return;
    this.resumen.set(await this.api.getResumen(this.eventoId()).catch(() => this.resumen()));
  }

  private bumpPresentes(cambio: number): void {
    const resumen = this.resumen();
    if (resumen) this.resumen.set({ ...resumen, presentes: resumen.presentes + cambio });
  }
}
