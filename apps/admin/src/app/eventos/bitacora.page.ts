import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { valorDe } from '@pasitos/panel';
import { BotonDirective, CampoComponent, EstadoComponent, TarjetaComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { EventosApi, type FilaBitacoraEvento } from './eventos-api.service';

/** Bitácora del evento (HU-213 §4): cuándo, quién, acción, sobre qué y antes → después. */
@Component({
  selector: 'adm-bitacora-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, JsonPipe, BotonDirective, CampoComponent, EstadoComponent, TarjetaComponent],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Bitácora</h1>
    <px-campo etiqueta="Buscar por persona" ayuda="Al menos 3 letras del nombre." #cb="pxCampo">
      <input
        [id]="cb.idControl"
        [attr.aria-describedby]="cb.idDescripcion"
        type="search"
        [value]="actor()"
        (input)="search(valorDe($event))"
      />
    </px-campo>
    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar la bitácora" [traceId]="traceId()" />
      }
      @default {
        @for (fila of items(); track fila.id) {
          <px-tarjeta>
            <p class="text-muted text-sm">
              {{ fila.cuando | date: 'dd/MM/yyyy HH:mm:ss' }} · {{ fila.quien.nombre
              }}{{ fila.quien.rol ? ' · ' + fila.quien.rol : ''
              }}{{ fila.dispositivo ? ' · ' + fila.dispositivo : '' }}
            </p>
            <p>
              <b>{{ fila.texto }}</b>{{ fila.objeto?.nombre ? ': ' + fila.objeto?.nombre : '' }}
            </p>
            @if (fila.despues) {
              <p class="text-muted text-sm break-all">
                {{ fila.antes ? (fila.antes | json) + ' → ' : '' }}{{ fila.despues | json }}
              </p>
            }
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" titulo="Todavía no hay acciones registradas" />
        }
        @if (cursor()) {
          <button type="button" pxBoton="secundario" (click)="load(true)">Cargar más</button>
        }
      }
    }
  `,
})
export class BitacoraPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly actual = inject(EventoActualService);
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly items = signal<readonly FilaBitacoraEvento[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly actor = signal('');
  protected readonly valorDe = valorDe;
  private espera: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    void this.load();
  }

  protected search(texto: string): void {
    this.actor.set(texto);
    clearTimeout(this.espera);
    this.espera = setTimeout(() => void this.load(), 300);
  }

  protected async load(mas = false): Promise<void> {
    const evento = this.actual.evento();
    if (!evento) return;
    try {
      const actor = this.actor().trim();
      const pagina = await this.api.listBitacora(evento.id, {
        ...(actor.length >= 3 ? { actor } : {}),
        cursor: mas ? this.cursor() : null,
      });
      this.items.set(mas ? [...this.items(), ...pagina.items] : pagina.items);
      this.cursor.set(pagina.pagination.nextCursor);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
