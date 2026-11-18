import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogoComponent, EncabezadoPaginaComponent, getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
} from '@pasitos/ui';
import { AlertasAbiertasService, AlertasApi, type AlertaPanel } from './alertas-api.service';
import { EventoActualService } from './evento.layout';

const TIPOS = ['', 'no_fui_yo', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'] as const;
const ESTADOS = [
  { valor: '', texto: 'Por revisar' },
  { valor: 'resuelta', texto: 'Revisadas' },
  { valor: 'descartada', texto: 'Descartadas' },
] as const;

/**
 * *Alertas* (HU-318 §3): las alertas de trampa con su frase, el modelo del celular (nunca la IP ni
 * la huella) y **Marcar revisada** con una nota. Ninguna bloquea a la persona.
 */
@Component({
  selector: 'adm-alertas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    DialogoComponent,
    EncabezadoPaginaComponent,
    EstadoComponent,
    RouterLink,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Alertas"
      descripcion="Señales de posible trampa. Solo avisan: nadie queda bloqueado."
    />
    <div class="flex flex-wrap gap-2">
      <select
        aria-label="Tipo"
        class="border-line h-11 rounded-lg border px-3"
        (change)="tipo.set($any($event.target).value); load()"
      >
        @for (t of tipos; track t) {
          <option [value]="t">
            {{ t === '' ? 'Todos los tipos' : t === 'no_fui_yo' ? 'No fui yo' : t }}
          </option>
        }
      </select>
      <select
        aria-label="Estado"
        class="border-line h-11 rounded-lg border px-3"
        (change)="estado.set($any($event.target).value); load()"
      >
        @for (e of estados; track e.valor) {
          <option [value]="e.valor">{{ e.texto }}</option>
        }
      </select>
    </div>
    @if (error(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    }
    @if (alertas(); as lista) {
      @if (lista.length === 0) {
        <px-estado tipo="vacio" titulo="No hay alertas." />
      }
      <ul class="flex flex-col gap-2">
        @for (a of lista; track a.id) {
          <li
            class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-4"
            data-testid="alerta"
          >
            <p class="flex flex-wrap items-center gap-2">
              <px-chip [variante]="a.prioridad === 'alta' ? 'peligro' : 'atenuado'">{{
                a.tipo === 'no_fui_yo' ? 'No fui yo' : a.tipo
              }}</px-chip>
              @if (a.estado === 'derivada') {
                <px-chip variante="puntos">Derivada</px-chip>
              }
              <span class="text-muted text-sm">{{ hora(a.at) }}</span>
            </p>
            <p class="font-semibold">{{ a.frase }}</p>
            @if (a.atendidaPor) {
              <p class="text-muted text-sm">Atendida por {{ a.atendidaPor }}</p>
            }
            @if (a.estado !== 'resuelta' && a.estado !== 'descartada') {
              <div class="flex flex-wrap gap-2">
                @if (a.asistente) {
                  <a
                    pxBoton="secundario"
                    [routerLink]="['/eventos', eventoId(), 'puerta']"
                    [queryParams]="{ asistente: a.asistente.id }"
                    >Ver persona</a
                  >
                }
                <button pxBoton type="button" (click)="abrir(a, 'revisada')">
                  Marcar revisada
                </button>
                <button pxBoton="fantasma" type="button" (click)="abrir(a, 'descartar')">
                  Descartar
                </button>
              </div>
            }
          </li>
        }
      </ul>
    } @else {
      <px-estado tipo="cargando" />
    }

    <pnl-dialogo
      [titulo]="accion() === 'revisada' ? 'Marcar revisada' : 'Descartar'"
      [abierto]="eligida() !== null"
      (cerrado)="eligida.set(null)"
    >
      <px-campo #cNota="pxCampo" etiqueta="Nota" ayuda="Qué revisaste. Queda en la bitácora.">
        <textarea
          [id]="cNota.idControl"
          [attr.aria-describedby]="cNota.idDescripcion"
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
        (click)="resolve()"
      >
        Guardar
      </button>
    </pnl-dialogo>
  `,
})
export class AlertasPage {
  private readonly api = inject(AlertasApi);
  private readonly abiertas = inject(AlertasAbiertasService);
  private readonly actual = inject(EventoActualService);
  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly tipos = TIPOS;
  protected readonly estados = ESTADOS;
  protected readonly tipo = signal('');
  protected readonly estado = signal('');
  protected readonly alertas = signal<readonly AlertaPanel[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly eligida = signal<AlertaPanel | null>(null);
  protected readonly accion = signal<'revisada' | 'descartar'>('revisada');
  protected readonly nota = signal('');

  constructor() {
    void this.load();
  }

  protected abrir(alerta: AlertaPanel, accion: 'revisada' | 'descartar'): void {
    this.accion.set(accion);
    this.nota.set('');
    this.eligida.set(alerta);
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.actual.evento()?.zonaHoraria ?? 'America/La_Paz',
    }).format(new Date(iso));
  }

  protected async resolve(): Promise<void> {
    const alerta = this.eligida();
    if (!alerta) return;
    try {
      await this.api.resolve(alerta.id, this.accion(), this.nota().trim());
      this.eligida.set(null);
      await this.load();
      void this.abiertas.refresh();
    } catch (error) {
      this.eligida.set(null);
      this.error.set(getMensajeError(error));
    }
  }

  protected async load(): Promise<void> {
    if (!this.eventoId()) return;
    try {
      this.alertas.set(
        await this.api.list(this.eventoId(), { tipo: this.tipo(), estado: this.estado() }),
      );
      this.error.set(null);
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }
}
