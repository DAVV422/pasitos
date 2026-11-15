import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { RouterOutlet, type CanActivateFn } from '@angular/router';
import { canDo, type AccionEvento } from '@pasitos/dominio';
import { ContextoEventoService, LayoutComponent, type ItemMenu } from '@pasitos/panel';
import { EventosApi, type EventoDetalle } from './eventos-api.service';

/** El evento abierto en el panel. Fija el rol en `ContextoEventoService` (HU-204 §5). */
@Injectable({ providedIn: 'root' })
export class EventoActualService {
  private readonly api = inject(EventosApi);
  private readonly contexto = inject(ContextoEventoService);
  readonly evento = signal<EventoDetalle | null>(null);

  async load(id: string): Promise<EventoDetalle> {
    const evento = await this.api.getEvento(id);
    this.set(evento);
    return evento;
  }

  set(evento: EventoDetalle): void {
    this.evento.set(evento);
    this.contexto.set(evento.id, evento.miRol);
  }
}

/** Carga el evento antes de sus pantallas; sin rol en él, el API responde 404 y vuelve a la lista. */
export const eventoGuard: CanActivateFn = async (ruta) => {
  const id = ruta.paramMap.get('id') ?? '';
  try {
    await inject(EventoActualService).load(id);
    return true;
  } catch {
    return false;
  }
};

/** Menú del evento según el rol: cada HU suma sus pantallas. */
const MENU_EVENTO: readonly (ItemMenu & { accion: AccionEvento })[] = [
  { ruta: '', texto: 'Resumen', accion: 'evento.read' },
  { ruta: 'configuracion', texto: 'Configuración', accion: 'evento.update' },
  { ruta: 'retos', texto: 'Retos', accion: 'contenido.read' },
  { ruta: 'catalogo', texto: 'Catálogo', accion: 'contenido.read' },
  { ruta: 'pantallas', texto: 'Pantallas', accion: 'terminales.read' },
  { ruta: 'mesas', texto: 'Mesas', accion: 'terminales.read' },
  { ruta: 'lugares', texto: 'Lugares', accion: 'contenido.read' },
  { ruta: 'agenda', texto: 'Agenda', accion: 'contenido.read' },
  { ruta: 'sponsors', texto: 'Sponsors', accion: 'contenido.read' },
  { ruta: 'preguntas', texto: 'Preguntas', accion: 'contenido.read' },
  { ruta: 'invitados', texto: 'Invitados', accion: 'invitados.update' },
  { ruta: 'equipo', texto: 'Equipo', accion: 'equipo.read' },
  { ruta: 'bitacora', texto: 'Bitácora', accion: 'bitacora.read' },
];

@Component({
  selector: 'adm-evento-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LayoutComponent, RouterOutlet],
  template: `
    <pnl-layout [titulo]="actual.evento()?.nombre ?? 'Evento'" [menu]="menu()">
      <router-outlet />
    </pnl-layout>
  `,
})
export class EventoLayout {
  protected readonly actual = inject(EventoActualService);
  protected readonly menu = computed(() => {
    const evento = this.actual.evento();
    if (!evento) {
      return [];
    }
    return [
      { ruta: '/eventos', texto: '← Mis eventos' },
      ...MENU_EVENTO.filter((item) => canDo(evento.miRol, item.accion)).map((item) => ({
        ruta: `/eventos/${evento.id}${item.ruta ? `/${item.ruta}` : ''}`,
        texto: item.texto,
      })),
    ];
  });
}
