import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutComponent, SesionService, type ItemMenu } from '@pasitos/panel';
import { PlataformaApi } from './plataforma-api.service';

const MENU: readonly ItemMenu[] = [
  { ruta: '/organizaciones', texto: 'Organizaciones' },
  { ruta: '/eventos', texto: 'Eventos' },
  { ruta: '/costo-red', texto: 'Costo de red' },
  { ruta: '/usuarios', texto: 'Personas' },
  { ruta: '/bitacora', texto: 'Bitácora' },
  { ruta: '/contactos', texto: 'Contactos' },
];

/** Marco de la consola de plataforma (HU-202 §7). */
@Component({
  selector: 'plt-consola-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LayoutComponent, RouterOutlet],
  template: `
    <pnl-layout contexto="Consola de plataforma" [menu]="menu()">
      <router-outlet />
    </pnl-layout>
  `,
})
export class ConsolaLayout implements OnInit {
  private readonly api = inject(PlataformaApi);
  /** HU-410: *Contactos* con el número de mensajes nuevos. */
  private readonly nuevos = signal(0);
  protected readonly menu = computed(() =>
    MENU.map((item) =>
      item.ruta === '/contactos' && this.nuevos() > 0 ? { ...item, contador: this.nuevos() } : item,
    ),
  );

  ngOnInit(): void {
    void this.api.listContactos({ estado: 'nuevo' }).then(
      (lista) => this.nuevos.set(lista.nuevos),
      () => undefined,
    );
  }
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
