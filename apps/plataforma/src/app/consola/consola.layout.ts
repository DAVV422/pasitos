import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutComponent, SesionService, type ItemMenu } from '@pasitos/panel';

const MENU: readonly ItemMenu[] = [
  { ruta: '/organizaciones', texto: 'Organizaciones' },
  { ruta: '/eventos', texto: 'Eventos' },
  { ruta: '/costo-red', texto: 'Costo de red' },
  { ruta: '/usuarios', texto: 'Personas' },
  { ruta: '/bitacora', texto: 'Bitácora' },
];

/** Marco de la consola de plataforma (HU-202 §7). */
@Component({
  selector: 'plt-consola-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LayoutComponent, RouterOutlet],
  template: `
    <pnl-layout titulo="Consola" [menu]="menu">
      <router-outlet />
    </pnl-layout>
  `,
})
export class ConsolaLayout {
  protected readonly menu = MENU;
}

/** Lo que puede hacer la persona en la consola: el servidor decide; esto solo oculta botones. */
export function usePermisosConsola() {
  const sesion = inject(SesionService);
  const rol = computed(() => sesion.usuario()?.rolPlataforma ?? null);
  return {
    rol,
    puedeEscribir: computed(() => rol() === 'superadmin' || rol() === 'admin'),
    esPrincipal: computed(() => rol() === 'superadmin'),
  };
}
