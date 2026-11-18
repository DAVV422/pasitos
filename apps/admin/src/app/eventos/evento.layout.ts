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

/**
 * Menú del evento según el rol, en grupos (Fase 2 de UI): cada HU suma sus pantallas.
 * Un grupo sin ninguna opción para el rol no aparece.
 */
const MENU_EVENTO: readonly (ItemMenu & { accion: AccionEvento })[] = [
  { ruta: '', texto: 'Resumen', grupo: 'Evento', exacto: true, accion: 'evento.read' },
  { ruta: 'configuracion', texto: 'Configuración', grupo: 'Evento', accion: 'evento.update' },
  { ruta: 'bitacora', texto: 'Bitácora', grupo: 'Evento', accion: 'bitacora.read' },
  { ruta: 'lugares', texto: 'Lugares', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'agenda', texto: 'Agenda', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'sponsors', texto: 'Sponsors', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'preguntas', texto: 'Preguntas', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'retos', texto: 'Retos', grupo: 'Juego', accion: 'contenido.read' },
  { ruta: 'catalogo', texto: 'Catálogo', grupo: 'Juego', accion: 'contenido.read' },
  { ruta: 'ajustes', texto: 'Ajustes', grupo: 'Juego', accion: 'puntos.ajustar' },
  { ruta: 'pantallas', texto: 'Pantallas', grupo: 'Dispositivos', accion: 'terminales.read' },
  { ruta: 'mesas', texto: 'Mesas', grupo: 'Dispositivos', accion: 'terminales.read' },
  {
    ruta: 'mis-pantallas',
    texto: 'Mis pantallas',
    grupo: 'Dispositivos',
    accion: 'pantallas.control',
  },
  { ruta: 'puerta', texto: 'Puerta', grupo: 'Personas', accion: 'puerta.use' },
  { ruta: 'invitados', texto: 'Invitados', grupo: 'Personas', accion: 'invitados.update' },
  { ruta: 'equipo', texto: 'Equipo', grupo: 'Personas', accion: 'equipo.read' },
];

@Component({
  selector: 'adm-evento-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LayoutComponent, RouterOutlet],
  template: `
    <pnl-layout
      [contexto]="actual.evento()?.nombre ?? 'Evento'"
      [volver]="{ ruta: '/eventos', texto: 'Mis eventos' }"
      [menu]="menu()"
    >
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
    return MENU_EVENTO.filter((item) => canDo(evento.miRol, item.accion)).map((item): ItemMenu => ({
      texto: item.texto,
      ruta: `/eventos/${evento.id}${item.ruta ? `/${item.ruta}` : ''}`,
      ...(item.grupo ? { grupo: item.grupo } : {}),
      ...(item.exacto ? { exacto: true } : {}),
    }));
  });
}
