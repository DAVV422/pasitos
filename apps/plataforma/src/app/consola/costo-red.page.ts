import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { valorDe } from '@pasitos/panel';
import { CampoComponent, EstadoComponent, FilaDatoComponent, TarjetaComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { PlataformaApi, type CostoRed } from './plataforma-api.service';

/** Costo de red del mes, por operación, en stroops y XLM (HU-104, HU-202 §3). */
@Component({
  selector: 'plt-costo-red-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyValuePipe, CampoComponent, EstadoComponent, FilaDatoComponent, TarjetaComponent],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Costo de red</h1>
    <px-campo etiqueta="Mes" #cm="pxCampo">
      <input
        [id]="cm.idControl"
        [attr.aria-describedby]="cm.idDescripcion"
        type="month"
        [value]="mes()"
        (change)="mes.set(valorDe($event)); load()"
      />
    </px-campo>
    @if (costo(); as c) {
      <px-tarjeta [destacada]="true">
        <px-fila-dato etiqueta="Total">{{ c.comisionXlm }} XLM</px-fila-dato>
        <px-fila-dato etiqueta="En stroops">{{ c.comisionStroops }}</px-fila-dato>
        <px-fila-dato etiqueta="Transacciones">{{ c.transacciones }}</px-fila-dato>
      </px-tarjeta>
      <px-tarjeta>
        <h2 class="mb-2 text-xl font-bold">Por operación</h2>
        @for (op of c.porOperacion | keyvalue; track op.key) {
          <px-fila-dato [etiqueta]="op.key"
            >{{ op.value.cantidad }} · {{ op.value.comisionXlm }} XLM</px-fila-dato
          >
        } @empty {
          <p class="text-muted">Sin transacciones en este mes.</p>
        }
      </px-tarjeta>
    } @else if (error()) {
      <px-estado tipo="error" titulo="No pudimos cargar el costo" [traceId]="traceId()" />
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class CostoRedPage implements OnInit {
  private readonly api = inject(PlataformaApi);
  protected readonly mes = signal(new Date().toISOString().slice(0, 7));
  protected readonly costo = signal<CostoRed | null>(null);
  protected readonly error = signal(false);
  protected readonly traceId = signal<string | null>(null);
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.costo.set(null);
    try {
      this.costo.set(await this.api.getCostoRed({ mes: this.mes() }));
      this.error.set(false);
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.error.set(true);
    }
  }
}
