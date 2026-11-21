import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconoComponent, type NombreIcono } from '@pasitos/ui';

interface Pestana {
  readonly ruta: string;
  readonly icono: NombreIcono;
  readonly texto: string;
}

/**
 * La barra inferior (HU-308 §3): Inicio, Retos, **Escanear** al centro y más grande, Canjear y
 * Más. Escanear y Canjear se apagan cuando no se puede (pausa, cierre, antes del inicio o sin
 * red) y dicen por qué.
 */
@Component({
  selector: 'app-navegacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, RouterLink, RouterLinkActive],
  template: `
    <nav
      aria-label="Principal"
      class="border-line bg-surface fixed inset-x-0 bottom-0 z-10 border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul class="mx-auto grid max-w-xl grid-cols-5 items-end">
        @for (pestana of pestanas; track pestana.ruta) {
          <li class="flex justify-center">
            @if (pestana.ruta === '/escanear') {
              @if (activas()) {
                <a
                  routerLink="/escanear"
                  routerLinkActive="text-points font-bold"
                  #activo="routerLinkActive"
                  [attr.aria-current]="activo.isActive ? 'page' : null"
                  class="text-muted flex min-h-14 w-full flex-col items-center justify-end gap-1 pb-1.5 text-xs"
                  aria-label="Escanear código QR"
                >
                  <span
                    class="bg-points text-on-points ring-line-strong -mt-6 flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
                    [class.ring-2]="activo.isActive"
                  >
                    <px-icono nombre="scan" [tamano]="26" />
                  </span>
                  <span>{{ pestana.texto }}</span>
                </a>
              } @else {
                <span
                  class="text-muted flex min-h-14 w-full flex-col items-center justify-end gap-1 pb-1.5 text-xs"
                  role="link"
                  aria-disabled="true"
                  [attr.aria-label]="'Escanear no disponible: ' + motivo()"
                  [title]="motivo()"
                >
                  <span
                    class="bg-surface2 text-muted -mt-6 flex h-14 w-14 items-center justify-center rounded-full"
                  >
                    <px-icono nombre="scan" [tamano]="26" />
                  </span>
                  <span>{{ pestana.texto }}</span>
                </span>
              }
            } @else {
              <a
                [routerLink]="pestana.ruta"
                routerLinkActive="text-points font-bold"
                #activo="routerLinkActive"
                [attr.aria-current]="activo.isActive ? 'page' : null"
                class="text-muted flex min-h-14 w-full flex-col items-center justify-end gap-1 pb-1.5 text-xs"
              >
                <px-icono [nombre]="pestana.icono" [tamano]="22" />
                <span>{{ pestana.texto }}</span>
              </a>
            }
          </li>
        }
      </ul>
    </nav>
  `,
})
export class NavegacionComponent {
  /** Si escanear y canjear están permitidos ahora. */
  readonly activas = input(true);
  readonly motivo = input('');

  protected readonly pestanas: readonly Pestana[] = [
    { ruta: '/inicio', icono: 'puntos', texto: 'Inicio' },
    { ruta: '/retos', icono: 'trophy', texto: 'Retos' },
    { ruta: '/escanear', icono: 'scan', texto: 'Escanear' },
    { ruta: '/canjear', icono: 'gift', texto: 'Canjear' },
    { ruta: '/cuenta', icono: 'menu', texto: 'Más' },
  ];
}
