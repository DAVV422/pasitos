import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChipComponent, IconoComponent, type NombreIcono } from '@pasitos/ui';
import { PreferenciasService } from '../preferencias';
import { SesionAsistente } from '../sesion-asistente';

interface Opcion {
  readonly ruta: string;
  readonly icono: NombreIcono;
  readonly texto: string;
  readonly detalle: string;
}

/**
 * *Mi cuenta* (HU-312 §2, mockup A17): quién es, su entrada, su celular y cómo ver mejor. Es la
 * pestaña *Más* de la barra; arriba, la agenda, el mapa, los sponsors y la información (HU-309).
 */
@Component({
  selector: 'app-cuenta-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipComponent, IconoComponent, RouterLink],
  template: `
    <h1 class="text-2xl font-extrabold">Mi cuenta</h1>
    @if (sesion.estado(); as e) {
      <section class="flex flex-col gap-1">
        <p class="text-lg font-bold">{{ e.asistente.nombre }}</p>
        <p class="text-muted">Código {{ e.asistente.codigo }}</p>
        @if (e.asistente.grupos.length > 0) {
          <div class="flex flex-wrap gap-2">
            @for (grupo of e.asistente.grupos; track grupo) {
              <px-chip variante="puntos">{{ grupo }}</px-chip>
            }
          </div>
        }
      </section>
    }
    <nav aria-label="El evento" class="grid grid-cols-2 gap-2">
      @for (opcion of opcionesEvento; track opcion.ruta) {
        <a
          [routerLink]="opcion.ruta"
          class="border-line bg-surface flex min-h-14 items-center gap-3 rounded-xl border p-4 font-bold"
        >
          <px-icono [nombre]="opcion.icono" [tamano]="22" />{{ opcion.texto }}
        </a>
      }
    </nav>
    <nav aria-label="Opciones de la cuenta" class="flex flex-col gap-2">
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

    <section class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
      <h2 class="text-muted text-sm font-bold uppercase">Ver mejor</h2>
      <label class="flex min-h-12 items-center justify-between gap-3">
        <span>Texto más grande</span>
        <input
          type="checkbox"
          class="h-6 w-6"
          [checked]="preferencias.textoGrande()"
          (change)="preferencias.setTextoGrande($any($event.target).checked)"
        />
      </label>
      <fieldset class="flex items-center justify-between gap-3">
        <legend class="sr-only">Tema</legend>
        <span aria-hidden="true">Tema</span>
        <span class="flex gap-2">
          @for (tema of temas; track tema.valor) {
            <label
              class="border-line flex min-h-11 items-center gap-2 rounded-lg border px-3"
              [class.border-points]="preferencias.tema() === tema.valor"
            >
              <input
                type="radio"
                name="tema"
                [value]="tema.valor"
                [checked]="preferencias.tema() === tema.valor"
                (change)="preferencias.setTema(tema.valor)"
              />
              {{ tema.texto }}
            </label>
          }
        </span>
      </fieldset>
    </section>

    @if (sesion.estado(); as e) {
      <p class="text-muted text-sm">
        Tus puntos valen solo durante {{ e.evento.nombre }} y vencen al cierre. No son dinero.
      </p>
    }
  `,
})
export class CuentaPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly preferencias = inject(PreferenciasService);
  protected readonly temas = [
    { valor: 'claro', texto: 'Claro' },
    { valor: 'oscuro', texto: 'Oscuro' },
  ] as const;
  /** HU-309: lo del evento, para orientarse aunque la señal sea mala. */
  protected readonly opcionesEvento: readonly Omit<Opcion, 'detalle'>[] = [
    { ruta: '/agenda', icono: 'cal', texto: 'Agenda' },
    { ruta: '/mapa', icono: 'pin', texto: 'Mapa' },
    { ruta: '/sponsors', icono: 'badge', texto: 'Sponsors' },
    { ruta: '/info', icono: 'info', texto: 'Información' },
  ];
  protected readonly opciones: readonly Opcion[] = [
    { ruta: '/mi-entrada', icono: 'ticket', texto: 'Mi entrada', detalle: 'Tu QR para la puerta' },
    {
      ruta: '/cuenta/datos',
      icono: 'user',
      texto: 'Mis datos',
      detalle: 'Tu nombre, correo y carnet',
    },
    {
      ruta: '/historial',
      icono: 'history',
      texto: 'Historial',
      detalle: 'Lo que ganaste y canjeaste',
    },
    {
      ruta: '/cuenta/dispositivo',
      icono: 'lock',
      texto: 'Mi dispositivo',
      detalle: 'Qué celular tiene tu entrada',
    },
  ];
}
