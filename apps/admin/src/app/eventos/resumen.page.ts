import { DatePipe } from '@angular/common';
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
import { getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  ChipComponent,
  EstadoComponent,
  FilaDatoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { EventosApi, type ListaChequeo, type TransicionPanel } from './eventos-api.service';

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
    FilaDatoComponent,
    TarjetaComponent,
  ],
  template: `
    @if (actual.evento(); as evento) {
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="font-display text-3xl font-extrabold">{{ evento.nombre }}</h1>
          <p class="text-muted">
            {{ evento.inicioAt | date: 'dd/MM/yyyy HH:mm' }} –
            {{ evento.finAt | date: 'dd/MM/yyyy HH:mm' }}
          </p>
        </div>
        <span class="flex gap-2">
          @if (evento.tipo !== 'real') {
            <px-chip variante="puntos">{{ evento.tipo === 'demo' ? 'Demo' : 'Prueba' }}</px-chip>
          }
          <px-chip [variante]="evento.estado === 'en_curso' ? 'ok' : 'atenuado'">{{
            nombreEstado(evento.estado)
          }}</px-chip>
        </span>
      </header>

      @if (mensaje(); as aviso) {
        <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
      }

      @if (boton(); as b) {
        <div>
          <button
            type="button"
            [pxBoton]="b.transicion === 'pausar' ? 'secundario' : 'primario'"
            [cargando]="enviando()"
            [deshabilitado]="b.transicion === 'publicar' && !lista()?.completa"
            (click)="transition(b.transicion)"
          >
            {{ b.texto }}
          </button>
        </div>
      }

      @if (evento.estado === 'borrador') {
        <px-tarjeta>
          <h2 class="mb-2 text-xl font-bold">Para publicar</h2>
          @if (lista(); as l) {
            <ul class="flex flex-col gap-2">
              @for (item of l.items; track $index) {
                <li class="flex items-start gap-2">
                  <span
                    [class.text-success]="item.ok"
                    [class.text-danger]="!item.ok"
                    aria-hidden="true"
                    >{{ item.ok ? '✓' : '•' }}</span
                  >
                  <span>{{ item.ok ? textoOk(item.clave) : item.texto }}</span>
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

      <px-tarjeta>
        <h2 class="mb-2 text-xl font-bold">En números</h2>
        <px-fila-dato etiqueta="Retos activos">{{ evento.contadores.retos }}</px-fila-dato>
        <px-fila-dato etiqueta="Pantallas (conectadas)"
          >{{ evento.contadores.pantallas }} ({{
            evento.contadores.pantallasConectadas
          }})</px-fila-dato
        >
        <px-fila-dato etiqueta="Mesas">{{ evento.contadores.mesas }}</px-fila-dato>
        <px-fila-dato etiqueta="Invitados">{{ evento.contadores.invitados }}</px-fila-dato>
        @if (evento.contadores.pantallas > evento.contadores.pantallasConectadas) {
          <px-aviso class="mt-2" variante="advertencia"
            >Hay pantallas sin conectar: conéctalas antes del evento para que sus retos
            funcionen.</px-aviso
          >
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
  protected readonly boton = computed(() => {
    const evento = this.actual.evento();
    if (!evento) return null;
    const boton = BOTON_POR_ESTADO[evento.estado];
    const accion = boton?.transicion === 'publicar' ? 'evento.publish' : 'evento.estado';
    return boton && canDo(evento.miRol, accion) ? boton : null;
  });
  private sondeo: ReturnType<typeof setInterval> | undefined;

  ngOnInit(): void {
    void this.loadLista();
    // Mientras se registra en Stellar, se vuelve a mirar cada 10 s.
    this.sondeo = setInterval(() => {
      const evento = this.actual.evento();
      if (evento && evento.estado !== 'borrador' && !evento.stellar.contratoId) {
        void this.actual.load(evento.id);
      }
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

  private async loadLista(): Promise<void> {
    const evento = this.actual.evento();
    if (evento?.estado === 'borrador') {
      this.lista.set(await this.api.getListaChequeo(evento.id));
    }
  }
}
