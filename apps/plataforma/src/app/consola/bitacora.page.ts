import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { EncabezadoPaginaComponent } from '@pasitos/panel';
import { BotonDirective, EstadoComponent, TarjetaComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { PlataformaApi, type FilaBitacora } from './plataforma-api.service';

/** Lo que se hizo desde la consola (HU-202 §6). */
@Component({
  selector: 'plt-bitacora-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    JsonPipe,
    BotonDirective,
    EncabezadoPaginaComponent,
    EstadoComponent,
    TarjetaComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Bitácora de la consola"
      descripcion="Registro inmutable de las acciones realizadas por el equipo de plataforma."
    />
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
              <p class="text-muted mt-1 flex flex-wrap items-center gap-1.5 text-sm break-all">
                @if (fila.antes) {
                  <code class="px-codigo bg-code-bg rounded px-1.5 py-0.5 text-xs">{{
                    fila.antes | json
                  }}</code>
                  <span>→</span>
                }
                <code class="px-codigo bg-code-bg rounded px-1.5 py-0.5 text-xs">{{
                  fila.despues | json
                }}</code>
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
