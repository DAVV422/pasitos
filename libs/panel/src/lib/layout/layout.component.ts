import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BotonDirective, EncabezadoComponent } from '@pasitos/ui';
import { SesionService } from '../sesion/sesion.service';

export interface ItemMenu {
  readonly ruta: string;
  readonly texto: string;
}

/**
 * Marco de las pantallas con sesión (`/admin` y `/plataforma`): encabezado, menú y la persona.
 * En el celular el menú queda arriba, en una fila que se desplaza.
 */
@Component({
  selector: 'pnl-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoComponent, RouterLink, RouterLinkActive, BotonDirective],
  template: `
    <px-encabezado [titulo]="titulo()" />
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-12 md:flex-row md:gap-8">
      <nav class="md:w-56 md:shrink-0" aria-label="Menú">
        <ul class="flex gap-1 overflow-x-auto md:flex-col">
          @for (item of menu(); track item.ruta) {
            <li>
              <a
                class="block rounded-medio px-3 py-2 whitespace-nowrap"
                [routerLink]="item.ruta"
                routerLinkActive="bg-surface2 font-bold"
                [routerLinkActiveOptions]="{ exact: false }"
              >
                {{ item.texto }}
              </a>
            </li>
          }
        </ul>
        <div class="border-line mt-4 hidden border-t pt-4 md:block">
          <p class="text-muted text-sm">{{ sesion.usuario()?.nombre }}</p>
          <div class="mt-2 flex flex-col gap-2">
            <a pxBoton="secundario" [chico]="true" [bloque]="true" routerLink="/cuenta"
              >Mi cuenta</a
            >
            <button
              type="button"
              pxBoton="secundario"
              [chico]="true"
              [bloque]="true"
              (click)="logout()"
            >
              Salir
            </button>
          </div>
        </div>
      </nav>
      <main class="pnl-contenido flex min-w-0 flex-1 flex-col gap-4">
        <ng-content />
      </main>
    </div>
  `,
})
export class LayoutComponent {
  readonly titulo = input('Pasitos');
  readonly menu = input.required<readonly ItemMenu[]>();

  protected readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected async logout(): Promise<void> {
    await this.sesion.logout();
    await this.router.navigate(['/entrar']);
  }
}
