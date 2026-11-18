import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getMensajeError } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, EstadoComponent, QrComponent } from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { PuertaApi, type TarjetaImpresa } from './puerta-api.service';

/**
 * La tarjeta impresa para quien no tiene celular (HU-302 §4, D31): nombre, código y el QR fijo de
 * *Mi entrada*. Sirve para el check-in y para que el equipo otorgue retos a mano; no para vincular.
 * La misma plantilla que las tarjetas de invitación (HU-211).
 */
@Component({
  selector: 'adm-imprimir-tarjeta-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent, QrComponent, RouterLink],
  template: `
    <header class="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <h1 class="font-display text-3xl font-extrabold">Tarjeta de entrada</h1>
      <span class="flex gap-2">
        <button type="button" pxBoton [deshabilitado]="!tarjeta()" (click)="print()">
          Imprimir
        </button>
        <a pxBoton="secundario" [routerLink]="['/eventos', eventoId(), 'puerta']">Volver</a>
      </span>
    </header>
    @if (error(); as texto) {
      <px-aviso variante="peligro">{{ texto }}</px-aviso>
    } @else if (tarjeta(); as t) {
      <section class="flex justify-center py-4">
        <article
          class="border-line flex w-[105mm] flex-col items-center gap-2 rounded-lg border p-4 text-center"
        >
          <p class="text-muted text-sm">{{ t.evento }}</p>
          <p class="text-xl font-bold">{{ t.nombre }}</p>
          <p class="font-display text-3xl font-extrabold">{{ t.codigo }}</p>
          <px-qr [texto]="t.qr" [tamano]="200" [descripcion]="'Entrada de ' + t.nombre" />
          <p class="text-sm">Muéstrala en la puerta y en los stands.</p>
        </article>
      </section>
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class ImprimirTarjetaPage implements OnInit {
  private readonly api = inject(PuertaApi);
  private readonly actual = inject(EventoActualService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly tarjeta = signal<TarjetaImpresa | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.tarjeta.set(
        await this.api.getTarjeta(this.ruta.snapshot.paramMap.get('asistenteId') ?? ''),
      );
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected print(): void {
    window.print();
  }
}
