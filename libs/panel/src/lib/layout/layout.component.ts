import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BotonDirective, EncabezadoComponent, HojaComponent, IconoComponent } from '@pasitos/ui';
import { AvisosComponent } from '../patrones/avisos';
import { SesionService } from '../sesion/sesion.service';

export interface ItemMenu {
  readonly ruta: string;
  readonly texto: string;
  /** Sección del menú (*Contenido*, *Juego*…). Los ítems sin grupo van arriba, sin título. */
  readonly grupo?: string;
  /** Activo solo en esa ruta exacta (por ejemplo, el *Resumen* en la ruta base del evento). */
  readonly exacto?: boolean;
  /** Un contador al lado (*Alertas · 2*, HU-318). */
  readonly contador?: number;
}

interface GrupoMenu {
  readonly titulo: string | null;
  readonly items: readonly ItemMenu[];
}

/**
 * Marco de las pantallas con sesión (`/admin` y `/plataforma`), Fase 2 de UI.
 * - Escritorio: menú a la izquierda, agrupado, con el enlace para volver y el contexto arriba.
 * - Celular: una barra fija con **☰ Menú**, el contexto y la sección; el menú se abre en una
 *   hoja, con *Mi cuenta* y *Salir* al final.
 */
@Component({
  selector: 'pnl-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    EncabezadoComponent,
    RouterLink,
    RouterLinkActive,
    BotonDirective,
    HojaComponent,
    IconoComponent,
    AvisosComponent,
  ],
  template: `
    <px-encabezado />

    <!-- Celular: barra fija con el menú -->
    <div class="pnl-barra">
      <button
        type="button"
        class="pnl-barra__menu"
        aria-haspopup="dialog"
        [attr.aria-expanded]="menuAbierto()"
        (click)="menuAbierto.set(true)"
      >
        <px-icono nombre="menu" />
        <span>Menú</span>
      </button>
      <span class="pnl-barra__donde">
        @if (contexto()) {
          <span class="pnl-barra__contexto">{{ contexto() }}</span>
        }
        <b>{{ seccion() }}</b>
      </span>
    </div>

    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-12 md:flex-row md:gap-8">
      <!-- Escritorio: menú a la izquierda -->
      <nav class="hidden md:block md:w-56 md:shrink-0" aria-label="Menú">
        <ng-container [ngTemplateOutlet]="navegacion" />
      </nav>
      <main class="pnl-contenido flex min-w-0 flex-1 flex-col gap-4">
        <ng-content />
      </main>
    </div>

    <px-hoja etiqueta="Menú" [abierta]="menuAbierto()" (cerrada)="menuAbierto.set(false)">
      @if (menuAbierto()) {
        <nav aria-label="Menú">
          <ng-container [ngTemplateOutlet]="navegacion" />
        </nav>
      }
    </px-hoja>

    <pnl-avisos />

    <ng-template #navegacion>
      <div class="pnl-menu">
        @if (volver(); as destino) {
          <a class="pnl-menu__volver" [routerLink]="destino.ruta">← {{ destino.texto }}</a>
        }
        @if (contexto()) {
          <p class="pnl-menu__contexto">{{ contexto() }}</p>
        }
        @for (grupo of grupos(); track grupo.titulo) {
          <div class="pnl-menu__grupo">
            @if (grupo.titulo) {
              <p class="pnl-menu__titulo">{{ grupo.titulo }}</p>
            }
            <ul>
              @for (item of grupo.items; track item.ruta) {
                <li>
                  <a
                    class="pnl-menu__item"
                    [routerLink]="item.ruta"
                    routerLinkActive="pnl-menu__item--activo"
                    ariaCurrentWhenActive="page"
                    [routerLinkActiveOptions]="{ exact: item.exacto ?? false }"
                  >
                    {{ item.texto }}
                    @if (item.contador) {
                      <span
                        class="bg-danger text-surface ml-2 rounded-full px-2 text-xs font-bold"
                        [attr.aria-label]="item.contador + ' sin revisar'"
                        >{{ item.contador }}</span
                      >
                    }
                  </a>
                </li>
              }
            </ul>
          </div>
        }
        <div class="pnl-menu__persona">
          <p class="text-muted text-sm">{{ sesion.usuario()?.nombre }}</p>
          <a
            pxBoton="secundario"
            [chico]="true"
            [bloque]="true"
            routerLink="/cuenta"
            routerLinkActive="pnl-menu__item--activo"
            ariaCurrentWhenActive="page"
            >Mi cuenta</a
          >
          <button
            type="button"
            pxBoton="fantasma"
            [chico]="true"
            [bloque]="true"
            (click)="logout()"
          >
            Salir
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class LayoutComponent {
  /** Lo que se está viendo: el nombre del evento, *Consola*… Aparece en el menú y la barra. */
  readonly contexto = input<string | null>(null);
  /** Enlace para volver, arriba del menú (por ejemplo, a *Mis eventos*). */
  readonly volver = input<{ ruta: string; texto: string } | null>(null);
  readonly menu = input.required<readonly ItemMenu[]>();

  protected readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  protected readonly menuAbierto = signal(false);
  private readonly url = signal(this.router.url);

  protected readonly grupos = computed((): readonly GrupoMenu[] => {
    const grupos: { titulo: string | null; items: ItemMenu[] }[] = [];
    for (const item of this.menu()) {
      const titulo = item.grupo ?? null;
      const grupo = grupos.find((g) => g.titulo === titulo);
      if (grupo) {
        grupo.items.push(item);
      } else {
        grupos.push({ titulo, items: [item] });
      }
    }
    return grupos;
  });

  /** La sección actual, para la barra del celular: el ítem cuya ruta coincide más. */
  protected readonly seccion = computed(() => {
    const url = this.url().split(/[?#]/)[0] ?? '';
    if (url.startsWith('/cuenta')) return 'Mi cuenta';
    const candidatos = this.menu().filter((item) =>
      item.exacto ? url === item.ruta : url === item.ruta || url.startsWith(`${item.ruta}/`),
    );
    return candidatos.sort((a, b) => b.ruta.length - a.ruta.length)[0]?.texto ?? '';
  });

  constructor() {
    const suscripcion = this.router.events.subscribe((evento) => {
      if (evento instanceof NavigationEnd) {
        this.url.set(evento.urlAfterRedirects);
        // Al elegir una opción, el menú del celular se cierra.
        this.menuAbierto.set(false);
      }
    });
    inject(DestroyRef).onDestroy(() => suscripcion.unsubscribe());
  }

  protected async logout(): Promise<void> {
    this.menuAbierto.set(false);
    await this.sesion.logout();
    await this.router.navigate(['/entrar']);
  }
}
