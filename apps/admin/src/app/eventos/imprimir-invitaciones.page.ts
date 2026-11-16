import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getMensajeError } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, EstadoComponent, QrComponent } from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { EventosApi, type EnlaceInvitacion } from './eventos-api.service';

/**
 * Tarjetas para imprimir (HU-211 §4): 4 por hoja A4, con nombre, código y el QR del enlace.
 * Los enlaces son los mismos que se mandaron por correo; verlos queda en la bitácora.
 */
@Component({
  selector: 'adm-imprimir-invitaciones-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvisoComponent, BotonDirective, EstadoComponent, QrComponent],
  template: `
    <header class="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <h1 class="font-display text-3xl font-extrabold">Tarjetas de invitación</h1>
      <span class="flex gap-2">
        <button type="button" pxBoton [deshabilitado]="enlaces().length === 0" (click)="print()">
          Imprimir
        </button>
        <a pxBoton="secundario" [routerLink]="['/eventos', eventoId(), 'invitados']">Volver</a>
      </span>
    </header>
    @if (error(); as texto) {
      <px-aviso variante="peligro">{{ texto }}</px-aviso>
    }
    @if (cargando()) {
      <px-estado tipo="cargando" />
    } @else if (enlaces().length === 0) {
      <px-estado tipo="vacio" titulo="No hay enlaces para imprimir">
        Los que ya abrieron su invitación no aparecen.
      </px-estado>
    } @else {
      @for (hoja of hojas(); track $index) {
        <section class="grid grid-cols-2 gap-4 py-4 break-after-page">
          @for (e of hoja; track e.codigo) {
            <article
              class="border-line flex flex-col items-center gap-2 rounded-lg border p-4 text-center"
            >
              <p class="text-xl font-bold">{{ e.nombre }}</p>
              <p class="text-muted">{{ e.codigo }}</p>
              <px-qr [texto]="e.enlace" [tamano]="200" [descripcion]="'QR de ' + e.nombre" />
              <p class="text-sm">Ábrelo con la cámara de tu celular</p>
            </article>
          }
        </section>
      }
    }
  `,
})
export class ImprimirInvitacionesPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly actual = inject(EventoActualService);

  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  protected readonly enlaces = signal<readonly EnlaceInvitacion[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly hojas = computed(() => {
    const lista = this.enlaces();
    const hojas: EnlaceInvitacion[][] = [];
    for (let i = 0; i < lista.length; i += 4) hojas.push(lista.slice(i, i + 4));
    return hojas;
  });

  async ngOnInit(): Promise<void> {
    try {
      this.enlaces.set(await this.api.listEnlaces(this.eventoId()));
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  protected print(): void {
    window.print();
  }
}
