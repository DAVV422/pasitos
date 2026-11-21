import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { canDo } from '@pasitos/dominio';
import { NOMBRES_ESTADO_EVENTO } from '@pasitos/dominio/esquemas';
import { EncabezadoPaginaComponent, getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import {
  EventosApi,
  type EstadoCierre,
  type ListaChequeo,
  type TransicionPanel,
} from './eventos-api.service';

const CONFIRMACIONES: Readonly<Record<TransicionPanel, string>> = {
  publicar:
    'Al publicar, los invitados ven la información y los retos (todavía sin puntos). Los retos y sus topes se registran en Stellar. ¿Publicar?',
  abrir: '¿Abrir el evento ahora? Los asistentes empiezan a ganar puntos.',
  pausar: 'Los asistentes no podrán ganar ni canjear puntos hasta que reanudes. ¿Pausar?',
  reanudar: '¿Reanudar el evento?',
};

const BOTON_POR_ESTADO: Readonly<Record<string, { transicion: TransicionPanel; texto: string }>> = {
  borrador: { transicion: 'publicar', texto: 'Publicar' },
  publicado: { transicion: 'abrir', texto: 'Abrir ahora' },
  en_curso: { transicion: 'pausar', texto: 'Pausar' },
  pausado: { transicion: 'reanudar', texto: 'Reanudar' },
};

/** Resumen del evento (O1, HU-205 §6): estado y su botón, lista de chequeo, Stellar y contadores. */
@Component({
  selector: 'adm-resumen-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    AvisoComponent,
    BotonDirective,
    ChipComponent,
    EstadoComponent,
    IconoComponent,
    TarjetaComponent,
    EncabezadoPaginaComponent,
    RouterLink,
  ],
  template: `
    @if (actual.evento(); as evento) {
      <pnl-encabezado-pagina [titulo]="evento.nombre">
        <p pnlDetalle class="pnl-pagina__descripcion flex flex-wrap items-center gap-2">
          <span>
            {{ evento.inicioAt | date: 'dd/MM/yyyy HH:mm' }} –
            {{ evento.finAt | date: 'dd/MM/yyyy HH:mm' }}
          </span>
          <px-chip [variante]="evento.estado === 'en_curso' ? 'ok' : 'atenuado'">{{
            nombreEstado(evento.estado)
          }}</px-chip>
          @if (evento.tipo !== 'real') {
            <px-chip variante="puntos">{{ evento.tipo === 'demo' ? 'Demo' : 'Prueba' }}</px-chip>
          }
        </p>
        @if (boton(); as b) {
          <button
            type="button"
            [pxBoton]="b.transicion === 'pausar' ? 'secundario' : 'primario'"
            [cargando]="enviando()"
            [deshabilitado]="b.transicion === 'publicar' && !lista()?.completa"
            (click)="transition(b.transicion)"
          >
            {{ b.texto }}
          </button>
        }
      </pnl-encabezado-pagina>

      @if (mensaje(); as aviso) {
        <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
      }

      @if (evento.estado === 'borrador') {
        <px-tarjeta>
          @if (lista(); as l) {
            <div class="mb-3 flex flex-col gap-2">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 class="text-xl font-bold">Para publicar</h2>
                <span class="text-muted text-sm" aria-live="polite">
                  {{ listos() }} de {{ l.items.length }} listos
                </span>
              </div>
              <div
                class="pnl-progreso"
                role="progressbar"
                aria-label="Para publicar"
                [attr.aria-valuenow]="listos()"
                aria-valuemin="0"
                [attr.aria-valuemax]="l.items.length"
              >
                <div
                  class="pnl-progreso__barra"
                  [style.width.%]="l.items.length ? (listos() * 100) / l.items.length : 0"
                ></div>
              </div>
            </div>
            <ul class="pnl-chequeo">
              @for (item of l.items; track item.clave) {
                <li class="pnl-chequeo__paso" [class.pnl-chequeo__paso--listo]="item.ok">
                  <span class="pnl-chequeo__marca">
                    @if (item.ok) {
                      <px-icono nombre="check" [tamano]="16" />
                    }
                  </span>
                  <span class="pnl-chequeo__texto">
                    <span class="pnl-chequeo__titulo">
                      <span class="px-sr-only">{{ item.ok ? 'Listo: ' : 'Falta: ' }}</span>
                      {{ textoOk(item.clave) }}
                    </span>
                    @if (!item.ok) {
                      <span class="pnl-chequeo__detalle">{{ item.texto }}</span>
                    }
                  </span>
                  @if (!item.ok) {
                    <a
                      pxBoton="secundario"
                      [chico]="true"
                      [routerLink]="['/eventos', evento.id, item.enlace]"
                    >
                      {{ textoEnlace(item.enlace) }}
                    </a>
                  }
                </li>
              }
            </ul>
            @if (l.completa) {
              <p class="text-success mt-2">Listo para publicar.</p>
            }
          } @else {
            <px-estado tipo="cargando" />
          }
        </px-tarjeta>
      }

      <section class="flex flex-col gap-3" aria-labelledby="resumen-numeros">
        <h2 id="resumen-numeros" class="text-xl font-bold">En números</h2>
        <div class="pnl-numeros">
          <div class="pnl-numero">
            <span class="pnl-numero__valor">{{ evento.contadores.retos }}</span>
            <span class="pnl-numero__texto">Retos activos</span>
          </div>
          <div class="pnl-numero">
            <span class="pnl-numero__valor"
              >{{ evento.contadores.pantallasConectadas }}/{{ evento.contadores.pantallas }}</span
            >
            <span class="pnl-numero__texto">Pantallas conectadas</span>
          </div>
          <div class="pnl-numero">
            <span class="pnl-numero__valor">{{ evento.contadores.mesas }}</span>
            <span class="pnl-numero__texto">Mesas de canje</span>
          </div>
          <div class="pnl-numero">
            <span class="pnl-numero__valor">{{ evento.contadores.invitados }}</span>
            <span class="pnl-numero__texto">Invitados</span>
          </div>
        </div>
        @if (evento.contadores.pantallas > evento.contadores.pantallasConectadas) {
          <px-aviso variante="advertencia">
            Hay pantallas sin conectar: conéctalas antes del evento para que sus retos funcionen.
            <a class="underline" [routerLink]="['/eventos', evento.id, 'pantallas']">
              Ir a Pantallas
            </a>
          </px-aviso>
        }
      </section>

      @if (cierre(); as c) {
        <!-- HU-401 §5.1: cómo va el cierre. -->
        <px-tarjeta data-testid="tarjeta-cierre">
          <h2 class="mb-2 text-xl font-bold">Cierre</h2>
          <p>
            Cerrado el {{ c.cerradoAt | date: 'dd/MM/yyyy' }} a las
            {{ c.cerradoAt | date: 'HH:mm' }}
            {{ c.cerradoPor ? 'por ' + c.cerradoPor : 'por Pasitos (automático)' }}.
          </p>
          @if (puedeVerReporte()) {
            <!-- HU-402. -->
            <a
              pxBoton="secundario"
              class="my-2"
              [routerLink]="['reporte']"
              data-testid="ver-reporte"
              >Ver el reporte</a
            >
          }
          @switch (c.cierreEstado) {
            @case ('listo') {
              <p class="text-success">Cierre registrado en Stellar ✓</p>
              @if (c.contrato; as enlace) {
                <a class="underline" [href]="enlace" target="_blank" rel="noopener"
                  >Ver el contrato en stellar.expert</a
                >
              }
            }
            @case ('fallido') {
              <px-aviso variante="peligro"
                >No pudimos registrar el cierre en Stellar. Ya avisamos al equipo de
                Pasitos.</px-aviso
              >
            }
            @default {
              <p>Registrando el cierre en Stellar…</p>
            }
          }
        </px-tarjeta>
      } @else if (evento.cierre.programadoAt) {
        <px-aviso variante="info" data-testid="cierre-programado"
          >El evento se cierra el
          {{ evento.cierre.programadoAt | date: 'dd/MM/yyyy HH:mm' }}.</px-aviso
        >
      }

      <px-tarjeta>
        <h2 class="mb-2 text-xl font-bold">Stellar</h2>
        @if (evento.stellar.contratoId) {
          <p class="text-success">Registrado en Stellar ✓</p>
          @if (evento.stellar.enlace; as enlace) {
            <a class="underline" [href]="enlace" target="_blank" rel="noopener"
              >Ver el contrato en stellar.expert</a
            >
          } @else {
            <p class="text-muted text-sm break-all">{{ evento.stellar.contratoId }} (red local)</p>
          }
        } @else if (evento.estado === 'borrador') {
          <p class="text-muted">Al publicar, el evento y sus retos se registran en Stellar.</p>
        } @else {
          <p>Registrando el evento en Stellar…</p>
        }
      </px-tarjeta>
    }
  `,
})
export class ResumenPage implements OnInit, OnDestroy {
  private readonly api = inject(EventosApi);
  protected readonly actual = inject(EventoActualService);

  protected readonly lista = signal<ListaChequeo | null>(null);
  protected readonly enviando = signal(false);
  protected readonly mensaje = signal<{
    variante: 'ok' | 'peligro' | 'advertencia';
    texto: string;
  } | null>(null);
  protected readonly puedeVerReporte = computed(() => {
    const evento = this.actual.evento();
    return !!evento && canDo(evento.miRol, 'reporte.read');
  });
  protected readonly boton = computed(() => {
    const evento = this.actual.evento();
    if (!evento) return null;
    const boton = BOTON_POR_ESTADO[evento.estado];
    const accion = boton?.transicion === 'publicar' ? 'evento.publish' : 'evento.estado';
    return boton && canDo(evento.miRol, accion) ? boton : null;
  });
  protected readonly listos = computed(
    () => this.lista()?.items.filter((item) => item.ok).length ?? 0,
  );
  protected readonly cierre = signal<EstadoCierre | null>(null);
  private sondeo: ReturnType<typeof setInterval> | undefined;

  ngOnInit(): void {
    void this.loadLista();
    // Mientras se registra en Stellar, se vuelve a mirar cada 10 s.
    void this.loadCierre();
    this.sondeo = setInterval(() => {
      const evento = this.actual.evento();
      if (evento && evento.estado !== 'borrador' && !evento.stellar.contratoId) {
        void this.actual.load(evento.id);
      }
      // HU-401: mientras se registra el cierre en Stellar.
      if (this.cierre()?.cierreEstado === 'sellando') void this.loadCierre();
    }, 10_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.sondeo);
  }

  protected nombreEstado(estado: string): string {
    return NOMBRES_ESTADO_EVENTO[estado as keyof typeof NOMBRES_ESTADO_EVENTO] ?? estado;
  }

  protected textoOk(clave: string): string {
    return (
      {
        fechas: 'Fechas del evento',
        retos: 'Al menos un reto',
        retos_con_pantalla: 'Retos con pantalla',
        catalogo_con_mesa: 'Catálogo con mesa',
        retos_en_horario: 'Retos en horario',
      }[clave] ?? clave
    );
  }

  protected textoEnlace(enlace: string): string {
    return (
      {
        configuracion: 'Ir a Configuración',
        retos: 'Ir a Retos',
        pantallas: 'Ir a Pantallas',
        mesas: 'Ir a Mesas',
      }[enlace] ?? 'Resolver'
    );
  }

  protected async transition(transicion: TransicionPanel): Promise<void> {
    const evento = this.actual.evento();
    if (!evento || this.enviando() || !window.confirm(CONFIRMACIONES[transicion])) {
      return;
    }
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      this.actual.set(await this.api.transition(evento.id, transicion));
      await this.loadLista();
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'TRANSICION_NO_PERMITIDA') {
        await this.actual.load(evento.id);
      }
      this.mensaje.set({
        variante:
          error instanceof ErrorApi && error.code === 'EVENTO_SIN_CONTRATO'
            ? 'advertencia'
            : 'peligro',
        texto: getMensajeError(error),
      });
    } finally {
      this.enviando.set(false);
    }
  }

  private async loadCierre(): Promise<void> {
    const evento = this.actual.evento();
    if (evento?.estado === 'cerrado') {
      this.cierre.set(await this.api.getCierre(evento.id).catch(() => null));
    }
  }

  private async loadLista(): Promise<void> {
    const evento = this.actual.evento();
    if (evento?.estado === 'borrador') {
      this.lista.set(await this.api.getListaChequeo(evento.id));
    }
  }
}
