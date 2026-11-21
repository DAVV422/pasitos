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
  host: { class: 'flex flex-col gap-6' },
  imports: [ChipComponent, IconoComponent, RouterLink],
  template: `
    <h1 class="text-2xl font-extrabold">Mi cuenta</h1>
    @if (sesion.estado(); as e) {
      <section
        class="border-line bg-surface flex items-center gap-3.5 rounded-2xl border p-4"
        aria-label="Tu perfil"
      >
        <span
          class="bg-pts-bg text-pts-fg flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <px-icono nombre="user" [tamano]="24" />
        </span>
        <div class="flex min-w-0 flex-col gap-1">
          <p class="truncate text-lg leading-tight font-bold">{{ e.asistente.nombre }}</p>
          <p class="text-muted text-sm">Código {{ e.asistente.codigo }}</p>
          @if (e.asistente.grupos.length > 0) {
            <div class="flex flex-wrap gap-1.5 pt-1">
              @for (grupo of e.asistente.grupos; track grupo) {
                <px-chip variante="puntos">{{ grupo }}</px-chip>
              }
            </div>
          }
        </div>
      </section>
    }
    <nav aria-label="El evento" class="grid grid-cols-2 gap-3">
      @for (opcion of opcionesEvento; track opcion.ruta) {
        <a
          [routerLink]="opcion.ruta"
          class="border-line bg-surface hover:border-points flex min-h-14 items-center gap-3 rounded-2xl border p-4 font-bold transition-colors"
        >
          <span
            class="bg-pts-bg text-pts-fg flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          >
            <px-icono [nombre]="opcion.icono" [tamano]="20" />
          </span>
          <span>{{ opcion.texto }}</span>
        </a>
      }
    </nav>
    <nav aria-label="Opciones de la cuenta" class="flex flex-col gap-3">
      @for (opcion of opciones; track opcion.ruta) {
        <a
          [routerLink]="opcion.ruta"
          class="border-line bg-surface hover:border-points flex min-h-16 items-center gap-3.5 rounded-2xl border p-4 transition-colors"
        >
          <span
            class="bg-surface2 text-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          >
            <px-icono [nombre]="opcion.icono" [tamano]="22" />
          </span>
          <span class="flex flex-col gap-0.5">
            <b>{{ opcion.texto }}</b>
            <span class="text-muted text-sm">{{ opcion.detalle }}</span>
          </span>
        </a>
      }
    </nav>

    <section class="border-line bg-surface flex flex-col gap-4 rounded-2xl border p-5">
      <h2 class="text-muted text-xs font-bold tracking-wider uppercase">Ver mejor</h2>
      <label class="flex min-h-12 cursor-pointer items-center justify-between gap-3">
        <span class="font-medium">Texto más grande</span>
        <input
          type="checkbox"
          class="h-6 w-6"
          [checked]="preferencias.textoGrande()"
          (change)="preferencias.setTextoGrande($any($event.target).checked)"
        />
      </label>
      <fieldset class="border-line flex items-center justify-between gap-3 border-t pt-4">
        <legend class="sr-only">Tema</legend>
        <span class="font-medium" aria-hidden="true">Tema</span>
        <span class="flex gap-2.5">
          @for (tema of temas; track tema.valor) {
            <label
              class="border-line flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3.5 font-medium"
              [class.border-points]="preferencias.tema() === tema.valor"
              [class.bg-pts-bg]="preferencias.tema() === tema.valor"
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

    <div class="flex flex-col gap-3 pt-1">
      @if (sesion.estado(); as e) {
        <p class="text-muted text-sm leading-relaxed">
          Tus puntos valen solo durante {{ e.evento.nombre }} y vencen al cierre. No son dinero.
        </p>
      }
      <nav aria-label="Información legal" class="text-muted flex gap-5 text-sm font-medium">
        <a href="/terminos" target="_blank" rel="noopener" class="underline">Términos</a>
        <a href="/privacidad" target="_blank" rel="noopener" class="underline">Privacidad</a>
      </nav>
    </div>
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
      ruta: '/cuenta/fotos',
      icono: 'image',
      texto: 'Mis fotos',
      detalle: 'Las fotos de tus retos y su autorización',
    },
    {
      ruta: '/cuenta/dispositivo',
      icono: 'lock',
      texto: 'Mi dispositivo',
      detalle: 'Qué celular tiene tu entrada',
    },
  ];
}
