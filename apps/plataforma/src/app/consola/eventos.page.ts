import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { INTERVALOS_ANCLAJE_MIN } from '@pasitos/dominio';
import { AvisosService, getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { usePermisosConsola } from './consola.layout';
import { PlataformaApi, type CostoRed, type EventoFila } from './plataforma-api.service';

/** Eventos de todas las organizaciones, con el intervalo de anclaje y su costo (HU-202 §3). */
@Component({
  selector: 'plt-eventos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    EstadoComponent,
    TarjetaComponent,
  ],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Eventos</h1>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }
    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar los eventos" [traceId]="traceId()" />
      }
      @default {
        @for (e of items(); track e.id) {
          <px-tarjeta>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <b>{{ e.nombre }}</b>
              <span class="text-muted text-sm"
                >{{ e.organizacion.nombre }} · {{ e.tipo }} · {{ e.estado }}</span
              >
            </div>
            <p class="text-muted text-sm">
              {{ e.inicioAt | date: 'dd/MM/yyyy HH:mm' }} ·
              {{ e.contratoId ? 'Contrato creado' : 'Sin contrato' }} · Anclaje cada
              {{ e.intervaloAnclajeMin ?? 'el de la plataforma'
              }}{{ e.intervaloAnclajeMin ? ' min' : '' }}
              @if (e.ultimoLoteConfirmadoAt) {
                · último lote {{ e.ultimoLoteConfirmadoAt | date: 'dd/MM HH:mm' }}
              }
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" pxBoton="secundario" [chico]="true" (click)="loadCosto(e)">
                Costo de red
              </button>
              @if (permisos.puedeEscribir()) {
                <button
                  type="button"
                  pxBoton="secundario"
                  [chico]="true"
                  (click)="editando.set(e.id)"
                >
                  Cambiar el intervalo
                </button>
                <button
                  type="button"
                  pxBoton="secundario"
                  [chico]="true"
                  [cargando]="descargando() === e.id"
                  (click)="downloadFotos(e)"
                >
                  Descargar fotos para redes
                </button>
              }
            </div>
            @if (costos()[e.id]; as costo) {
              <p class="mt-2 text-sm">
                {{ costo.transacciones }} transacciones · {{ costo.comisionXlm }} XLM ({{
                  costo.comisionStroops
                }}
                stroops)
              </p>
            }
            @if (editando() === e.id) {
              <form
                class="mt-3 flex flex-col gap-3"
                (submit)="submitIntervalo($event, e)"
                novalidate
              >
                <px-campo etiqueta="Cada cuántos minutos" #ci="pxCampo">
                  <select
                    [id]="ci.idControl"
                    [attr.aria-describedby]="ci.idDescripcion"
                    (change)="intervalo.set(valorDe($event))"
                  >
                    <option value="" [selected]="!e.intervaloAnclajeMin">
                      El de la plataforma
                    </option>
                    @for (m of intervalos; track m) {
                      <option [value]="m" [selected]="e.intervaloAnclajeMin === m">
                        {{ m }} min
                      </option>
                    }
                  </select>
                </px-campo>
                <px-campo etiqueta="Motivo" ayuda="Queda en la bitácora." #cm="pxCampo">
                  <input
                    [id]="cm.idControl"
                    [attr.aria-describedby]="cm.idDescripcion"
                    [value]="motivo()"
                    (input)="motivo.set(valorDe($event))"
                  />
                </px-campo>
                <div class="flex gap-2">
                  <button type="submit" pxBoton [cargando]="enviando()">Guardar</button>
                  <button type="button" pxBoton="secundario" (click)="editando.set(null)">
                    Cancelar
                  </button>
                </div>
              </form>
            }
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" titulo="Todavía no hay eventos" />
        }
        @if (cursor()) {
          <button type="button" pxBoton="secundario" (click)="load(true)">Cargar más</button>
        }
      }
    }
  `,
})
export class EventosPage implements OnInit {
  private readonly api = inject(PlataformaApi);
  private readonly avisos = inject(AvisosService);
  protected readonly permisos = usePermisosConsola();
  protected readonly intervalos = INTERVALOS_ANCLAJE_MIN;

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly items = signal<readonly EventoFila[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly costos = signal<Record<string, CostoRed>>({});
  protected readonly editando = signal<string | null>(null);
  protected readonly intervalo = signal('');
  protected readonly motivo = signal('');
  protected readonly enviando = signal(false);
  protected readonly descargando = signal<string | null>(null);
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(mas = false): Promise<void> {
    try {
      const pagina = await this.api.listEventos({ cursor: mas ? this.cursor() : null });
      this.items.set(mas ? [...this.items(), ...pagina.items] : pagina.items);
      this.cursor.set(pagina.pagination.nextCursor);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }

  protected async loadCosto(evento: EventoFila): Promise<void> {
    const costo = await this.api.getCostoRed({ eventoId: evento.id });
    this.costos.set({ ...this.costos(), [evento.id]: costo });
  }

  /** HU-324: solo las aprobadas con autorización vigente; queda en las dos bitácoras. */
  protected async downloadFotos(evento: EventoFila): Promise<void> {
    if (
      !window.confirm(
        `Se descargan las fotos aprobadas de ${evento.nombre} que autorizan su uso. Queda en la bitácora del evento y en la de plataforma. ¿Seguir?`,
      )
    ) {
      return;
    }
    this.descargando.set(evento.id);
    this.mensaje.set(null);
    try {
      const { operacionId } = await this.api.createDescargaFotos(evento.id);
      for (let intento = 0; intento < 120; intento++) {
        const operacion = await this.api.getOperacion(evento.id, operacionId);
        if (operacion.descarga) {
          window.location.href = operacion.descarga.url;
          this.avisos.ok('Descargamos las fotos.');
          return;
        }
        if (operacion.estado === 'fallida') throw new Error(operacion.error ?? 'Falló');
        await new Promise((r) => setTimeout(r, 1_000));
      }
      this.mensaje.set({
        variante: 'peligro',
        texto: 'El ZIP sigue armándose. Intenta en un rato.',
      });
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    } finally {
      this.descargando.set(null);
    }
  }

  protected async submitIntervalo(evento: Event, fila: EventoFila): Promise<void> {
    evento.preventDefault();
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      const valor = this.intervalo() || String(fila.intervaloAnclajeMin ?? '');
      await this.api.updateIntervalo(fila.id, valor ? Number(valor) : null, this.motivo().trim());
      this.avisos.ok('Intervalo cambiado: vale desde el próximo ciclo del sellador.');
      this.editando.set(null);
      this.motivo.set('');
      await this.load();
    } catch (error) {
      const campo = error instanceof ErrorApi ? error.errors[0]?.message : undefined;
      this.mensaje.set({ variante: 'peligro', texto: campo ?? getMensajeError(error) });
    } finally {
      this.enviando.set(false);
    }
  }
}
