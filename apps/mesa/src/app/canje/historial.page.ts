import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChipComponent, EstadoComponent } from '@pasitos/ui';
import { MesaApi, type CanjeDelDia } from '../mesa-api.service';

const ESTADOS: Readonly<Record<string, string>> = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
  anulado: 'Anulado',
};

/** El historial de la mesa (HU-316 §3): los canjes del día, con su comprobante. */
@Component({
  selector: 'mesa-historial-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, EstadoComponent, RouterLink],
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-extrabold">Canjes de hoy</h1>
      <a routerLink="/canje" class="text-points font-semibold underline">Nuevo canje</a>
    </header>
    @if (canjes(); as lista) {
      @if (lista.length === 0) {
        <px-estado tipo="vacio" titulo="Todavía no hay canjes hoy." />
      } @else {
        <ul class="flex flex-col gap-2">
          @for (c of lista; track c.id) {
            <li class="border-line bg-surface flex flex-col gap-1 rounded-xl border p-3">
              <p class="flex items-center justify-between gap-2">
                <b class="font-display text-xl">{{ c.comprobante }}</b>
                <px-chip [variante]="c.estado === 'confirmado' ? 'ok' : 'atenuado'">{{
                  estadoDe(c.estado)
                }}</px-chip>
              </p>
              <p class="text-muted text-sm">
                {{ hora(c.at) }}
                @if (c.asistente; as a) {
                  · {{ a.nombre }} · {{ a.codigo }}
                }
              </p>
              <p class="text-sm">
                @for (i of c.items; track i.premioId; let ultimo = $last) {
                  {{ i.cantidad }} × {{ i.nombre }}{{ ultimo ? '' : ', ' }}
                }
                · {{ c.total }} pts
              </p>
            </li>
          }
        </ul>
      }
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class HistorialPage {
  private readonly api = inject(MesaApi);
  protected readonly canjes = signal<readonly CanjeDelDia[] | null>(null);

  constructor() {
    void this.api.listHistorial().then(
      (lista) => this.canjes.set(lista),
      () => this.canjes.set([]),
    );
  }

  protected estadoDe(estado: string): string {
    return ESTADOS[estado] ?? estado;
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/La_Paz',
    }).format(new Date(iso));
  }
}
