import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
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
import { RouterLink } from '@angular/router';
import { AccesoPuertaComponent, type AvisoVinculado } from './acceso-puerta.component';
import { EventoActualService } from './evento.layout';
import {
  PuertaApi,
  type FichaPuerta,
  type ResultadoBusqueda,
  type ResumenPuerta,
} from './puerta-api.service';

type Modo = 'inicio' | 'escanear' | 'buscar' | 'ficha' | 'acceso';

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
  imports: [
    AccesoPuertaComponent,
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
      @if (resumen()?.avisosNoFuiYo; as avisos) {
        <px-aviso variante="peligro"
          >{{ avisos }} {{ avisos === 1 ? 'aviso' : 'avisos' }} «No fui yo» por atender.</px-aviso
        >
      }
      @if (resumen()?.registrosRestantes !== null && resumen()?.registrosRestantes !== undefined) {
        <p class="text-muted text-sm">
          Te quedan {{ resumen()?.registrosRestantes }} registros en la puerta.
        </p>
      }

      @switch (modo()) {
        @case ('acceso') {
          @if (ficha(); as f) {
            <adm-acceso-puerta
              [ficha]="f"
              [zonaHoraria]="zona()"
              [avisoVinculado]="avisoVinculado()"
              (listo)="reset()"
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
              @if (f.historial.length > 0) {
                <details class="text-sm">
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
                  <button pxBoton="secundario" type="button" (click)="setModo('acceso')">
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
          <px-campo
            #busqueda="pxCampo"
            etiqueta="Nombre, código o correo"
            ayuda="Desde la 3.ª letra."
          >
            <input
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
  /** Cómo se llegó a la ficha: el método del check-in. */
  private metodo: 'escaneo_entrada' | 'busqueda' = 'busqueda';
  private esperaBusqueda: ReturnType<typeof setTimeout> | undefined;
  private volver: ReturnType<typeof setTimeout> | undefined;
  private leyendo = false;

  protected readonly puedeDeshacer = computed(() => this.contexto.canDo('puntos.ajustar'));
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly zona = computed(() => this.actual.evento()?.zonaHoraria ?? 'America/La_Paz');

  constructor() {
    void this.loadResumen();
    const canal = inject(EnVivoService).connect(
      `/api/v1/eventos/${this.eventoId()}/en-vivo`,
      ['asistencia.registrada', 'asistencia.anulada', 'alerta.creada', 'acceso.vinculado'],
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

  protected setModo(modo: Modo): void {
    this.error.set(null);
    this.modo.set(modo);
  }

  protected reset(): void {
    clearTimeout(this.volver);
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
      this.ficha.set(await this.api.register(ficha.id, this.metodo));
      this.bumpPresentes(1);
      // Vuelve sola a buscar: la fila sigue.
      this.volver = setTimeout(() => this.reset(), VOLVER_MS);
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
