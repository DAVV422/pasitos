import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent, type NombreIcono } from '@pasitos/ui';
import { SesionAsistente } from '../sesion-asistente';

interface Opcion {
  readonly ruta: string;
  readonly icono: NombreIcono;
  readonly texto: string;
  readonly detalle: string;
}

/** *Más*: lo que no está en la barra (HU-308 §3). */
@Component({
  selector: 'app-mas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, RouterLink],
  template: `
    <h1 class="text-2xl font-extrabold">Más</h1>
    @if (sesion.estado(); as e) {
      <p class="text-muted">{{ e.asistente.nombre }} · {{ e.asistente.codigo }}</p>
    }
    <nav aria-label="Más opciones" class="flex flex-col gap-2">
      @for (opcion of opciones; track opcion.ruta) {
        <a
          [routerLink]="opcion.ruta"
          class="border-line bg-surface flex min-h-14 items-center gap-3 rounded-xl border p-4"
        >
          <px-icono [nombre]="opcion.icono" [tamano]="22" />
          <span class="flex flex-col">
            <b>{{ opcion.texto }}</b>
            <span class="text-muted text-sm">{{ opcion.detalle }}</span>
          </span>
        </a>
      }
    </nav>
  `,
})
export class MasPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly opciones: readonly Opcion[] = [
    { ruta: '/mi-entrada', icono: 'ticket', texto: 'Mi entrada', detalle: 'Tu QR para la puerta' },
    {
      ruta: '/historial',
      icono: 'history',
      texto: 'Historial',
      detalle: 'Lo que ganaste y canjeaste',
    },
  ];
}
