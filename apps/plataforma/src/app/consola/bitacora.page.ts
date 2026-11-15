import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { BotonDirective, EstadoComponent, TarjetaComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { PlataformaApi, type FilaBitacora } from './plataforma-api.service';

/** Lo que se hizo desde la consola (HU-202 §6). */
@Component({
  selector: 'plt-bitacora-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, JsonPipe, BotonDirective, EstadoComponent, TarjetaComponent],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Bitácora de la consola</h1>
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
              {{ fila.cuando | date: 'dd/MM/yyyy HH:mm' }} · {{ fila.quien.nombre
              }}{{ fila.quien.rol ? ' · ' + fila.quien.rol : '' }}
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
  private readonly api = inject(PlataformaApi);
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly items = signal<readonly FilaBitacora[]>([]);
  protected readonly cursor = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(mas = false): Promise<void> {
    try {
      const pagina = await this.api.listBitacora(mas ? this.cursor() : null);
      this.items.set(mas ? [...this.items(), ...pagina.items] : pagina.items);
      this.cursor.set(pagina.pagination.nextCursor);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
