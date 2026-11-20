import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { isConfirmacionCierre } from '@pasitos/dominio/esquemas';
import { AvisosService, EncabezadoPaginaComponent, getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  FechaHoraDirective,
  TarjetaComponent,
} from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { EventosApi, type VistaPreviaCierre } from './eventos-api.service';

/** `2026-11-21T23:00:00Z` → `2026-11-21T19:00` (hora de Bolivia, como el resto del panel). */
function toLocalBolivia(iso: string): string {
  const fecha = new Date(new Date(iso).getTime() - 4 * 3_600_000);
  return fecha.toISOString().slice(0, 16);
}

/**
 * *Cerrar el evento* (HU-401 §5.1, mockup O10), solo para el dueño: lo que va a pasar con los
 * números de ahora, programar el cierre y cerrar escribiendo CERRAR. No se deshace.
 */
@Component({
  selector: 'adm-cierre-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    EncabezadoPaginaComponent,
    EstadoComponent,
    FechaHoraDirective,
    TarjetaComponent,
  ],
  template: `
    <pnl-encabezado-pagina titulo="Cerrar el evento" />
    @if (error(); as e) {
      <px-aviso variante="peligro" role="alert">{{ e }}</px-aviso>
    }
    @if (vista(); as v) {
      @if (v.estado === 'cerrado') {
        <px-aviso variante="ok">El evento ya está cerrado.</px-aviso>
      } @else {
        <px-tarjeta>
          <h2 class="mb-2 text-xl font-bold">Al cerrar</h2>
          <ul class="flex list-disc flex-col gap-1 pl-5" data-testid="vista-previa">
            <li>
              @if (v.personasConSaldo > 0) {
                {{ v.personasConSaldo }}
                {{ v.personasConSaldo === 1 ? 'persona tiene' : 'personas tienen' }}
                <b>{{ v.puntosSinUsar }} {{ nombrePuntos() }}</b> sin usar: van a vencer.
              } @else {
                Nadie tiene {{ nombrePuntos() }} sin usar.
              }
            </li>
            @if (v.cobrosPendientes > 0) {
              <li>
                {{ v.cobrosPendientes }}
                {{
                  v.cobrosPendientes === 1
                    ? 'cobro pendiente en las mesas se va a cancelar'
                    : 'cobros pendientes en las mesas se van a cancelar'
                }}.
              </li>
            }
            <li>Nadie va a poder ganar ni canjear {{ nombrePuntos() }}.</li>
            <li>Se registra el cierre en Stellar y después se genera el reporte.</li>
            <li><b>No se puede deshacer.</b></li>
          </ul>
        </px-tarjeta>

        <px-tarjeta>
          <h2 class="mb-1 text-xl font-bold">Programar el cierre</h2>
          <p class="text-muted mb-3 text-sm">
            Media hora antes, los asistentes ven
            <i>"Los {{ nombrePuntos() }} vencen a las … ¡Canjéalos!"</i>. Si no lo cierras ni lo
            programas, se cierra solo el {{ v.automaticoAt | date: 'dd/MM HH:mm' }}.
          </p>
          @if (v.programadoAt) {
            <p class="mb-3" data-testid="programado">
              Se cierra el <b>{{ v.programadoAt | date: 'dd/MM/yyyy HH:mm' }}</b>.
            </p>
          }
          <div class="flex flex-wrap items-end gap-3">
            <px-campo etiqueta="Fecha y hora (Bolivia)" #cp="pxCampo">
              <input
                [id]="cp.idControl"
                [attr.aria-describedby]="cp.idDescripcion"
                [pxFechaHora]="programado()"
                (fechaHora)="programado.set($event)"
              />
            </px-campo>
            <button
              type="button"
              pxBoton="secundario"
              [cargando]="guardando()"
              [deshabilitado]="!programado()"
              (click)="schedule(programado())"
            >
              Programar
            </button>
            @if (v.programadoAt) {
              <button type="button" pxBoton="fantasma" (click)="schedule('')">Quitar</button>
            }
          </div>
        </px-tarjeta>

        <px-tarjeta>
          <h2 class="mb-3 text-xl font-bold">Cerrar ahora</h2>
          <form class="flex flex-col gap-3" (submit)="close($event)" novalidate>
            <px-campo etiqueta="Escribe CERRAR para confirmar" #cc="pxCampo">
              <input
                [id]="cc.idControl"
                [attr.aria-describedby]="cc.idDescripcion"
                autocomplete="off"
                [value]="confirmacion()"
                (input)="confirmacion.set(valorDe($event))"
              />
            </px-campo>
            <div>
              <button
                type="submit"
                pxBoton="peligro"
                [cargando]="cerrando()"
                [deshabilitado]="!confirmado()"
              >
                Cerrar el evento
              </button>
            </div>
          </form>
        </px-tarjeta>
      }
    } @else if (!error()) {
      <px-estado tipo="cargando" />
    }
  `,
})
export class CierrePage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly actual = inject(EventoActualService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);

  protected readonly valorDe = valorDe;
  protected readonly vista = signal<VistaPreviaCierre | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmacion = signal('');
  protected readonly programado = signal('');
  protected readonly cerrando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly confirmado = computed(() => isConfirmacionCierre(this.confirmacion()));
  protected readonly nombrePuntos = computed(() => this.actual.evento()?.nombrePuntos ?? 'puntos');
  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const vista = await this.api.getVistaPreviaCierre(this.eventoId());
      this.vista.set(vista);
      this.programado.set(vista.programadoAt ? toLocalBolivia(vista.programadoAt) : '');
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected async schedule(local: string): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.api.scheduleCierre(this.eventoId(), local ? `${local}:00-04:00` : null);
      this.avisos.ok(local ? 'Programamos el cierre.' : 'Quitamos el cierre programado.');
      await this.load();
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async close(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.confirmado() || this.cerrando()) return;
    this.cerrando.set(true);
    this.error.set(null);
    try {
      const resultado = await this.api.close(this.eventoId(), this.confirmacion());
      this.avisos.ok(
        resultado.vencimientos > 0
          ? `Cerramos el evento: vencieron ${resultado.puntosVencidos} ${this.nombrePuntos()} de ${resultado.vencimientos} personas.`
          : 'Cerramos el evento.',
      );
      await this.actual.load(this.eventoId());
      await this.router.navigate(['/eventos', this.eventoId()]);
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.cerrando.set(false);
    }
  }
}
