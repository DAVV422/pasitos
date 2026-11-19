import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { RouterOutlet, type CanActivateFn } from '@angular/router';
import { canDo, type AccionEvento } from '@pasitos/dominio';
import { ContextoEventoService, LayoutComponent, type ItemMenu } from '@pasitos/panel';
import { AlertasAbiertasService } from './alertas-api.service';
import { FotosPendientesService } from './fotos-api.service';
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
  { ruta: 'alertas', texto: 'Alertas', grupo: 'Evento', accion: 'bitacora.read' },
  { ruta: 'lugares', texto: 'Lugares', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'agenda', texto: 'Agenda', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'sponsors', texto: 'Sponsors', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'preguntas', texto: 'Preguntas', grupo: 'Contenido', accion: 'contenido.read' },
  { ruta: 'retos', texto: 'Retos', grupo: 'Juego', accion: 'contenido.read' },
  // HU-323: aparece si a la persona le toca revisar (lo dice el servidor).
  { ruta: 'fotos/revisar', texto: 'Fotos por revisar', grupo: 'Juego', accion: 'evento.read' },
  // HU-324: todas las fotos, para quien revisa.
  { ruta: 'fotos', texto: 'Fotos', grupo: 'Juego', exacto: true, accion: 'evento.read' },
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
  { ruta: 'qr-registro', texto: 'QR de registro', grupo: 'Personas', accion: 'qr_registro.read' },
  { ruta: 'carnets', texto: 'Verificar carnet', grupo: 'Personas', accion: 'ci.verify' },
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
  private readonly alertas = inject(AlertasAbiertasService);
  private readonly fotos = inject(FotosPendientesService);
  private readonly destroy = inject(DestroyRef);

  constructor() {
    // HU-318: el contador de alertas y el aviso al llegar una, para dueño y coorganizador.
    effect(() => {
      const evento = this.actual.evento();
      if (evento && canDo(evento.miRol, 'bitacora.read'))
        this.alertas.watch(evento.id, this.destroy);
      // HU-323: las fotos por revisar, para quien revisa (D, C o responsable de un reto).
      if (evento) this.fotos.watch(evento.id, this.destroy);
    });
  }

  protected readonly menu = computed(() => {
    const evento = this.actual.evento();
    if (!evento) {
      return [];
    }
    const abiertas = this.alertas.abiertas();
    const fotos = this.fotos.pendientes();
    return MENU_EVENTO.filter(
      (item) =>
        canDo(evento.miRol, item.accion) &&
        (!item.ruta.startsWith('fotos') || fotos?.puedeRevisar === true),
    ).map((item): ItemMenu => ({
      texto: item.texto,
      ruta: `/eventos/${evento.id}${item.ruta ? `/${item.ruta}` : ''}`,
      ...(item.grupo ? { grupo: item.grupo } : {}),
      ...(item.exacto ? { exacto: true } : {}),
      ...(item.ruta === 'alertas' && abiertas > 0 ? { contador: abiertas } : {}),
      ...(item.ruta === 'fotos/revisar' && (fotos?.total ?? 0) > 0
        ? { contador: fotos?.total ?? 0 }
        : {}),
    }));
  });
}
