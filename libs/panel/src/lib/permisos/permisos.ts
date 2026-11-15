import {
  computed,
  Directive,
  effect,
  inject,
  Injectable,
  input,
  signal,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn } from '@angular/router';
import { canDo, type AccionEvento, type RolEvento } from '@pasitos/dominio';

/**
 * El rol de la persona en el evento abierto (HU-204 §5). Lo fija la pantalla del evento con
 * `miRol` de `GET /eventos/:eventoId`. **Solo sirve para ocultar**: el servidor decide.
 */
@Injectable({ providedIn: 'root' })
export class ContextoEventoService {
  private readonly actual = signal<{ eventoId: string; rol: RolEvento } | null>(null);

  readonly eventoId = computed(() => this.actual()?.eventoId ?? null);
  readonly rol = computed(() => this.actual()?.rol ?? null);

  set(eventoId: string, rol: RolEvento): void {
    this.actual.set({ eventoId, rol });
  }

  clear(): void {
    this.actual.set(null);
  }

  canDo(accion: AccionEvento): boolean {
    const rol = this.rol();
    return rol !== null && canDo(rol, accion);
  }
}

/**
 * `*pnlSiPuede="'contenido.update'"`: muestra el bloque solo si el rol del evento abierto puede.
 * Si alguien llama al API igual, el servidor responde 403.
 */
@Directive({ selector: '[pnlSiPuede]' })
export class SiPuedeDirective {
  readonly pnlSiPuede = input.required<AccionEvento>();

  private readonly plantilla = inject(TemplateRef<unknown>);
  private readonly vista = inject(ViewContainerRef);
  private readonly contexto = inject(ContextoEventoService);
  private mostrando = false;

  constructor() {
    effect(() => {
      const puede = this.contexto.canDo(this.pnlSiPuede());
      if (puede && !this.mostrando) {
        this.vista.createEmbeddedView(this.plantilla);
      } else if (!puede && this.mostrando) {
        this.vista.clear();
      }
      this.mostrando = puede;
    });
  }
}

/**
 * `canMatch` por acción: una pantalla que el rol no usa ni se descarga (el registrador no baja el
 * resto del panel). Necesita que el contexto del evento esté fijado antes (lo hace la ruta padre).
 */
export function canDoMatch(accion: AccionEvento): CanMatchFn {
  return () => inject(ContextoEventoService).canDo(accion);
}

/**
 * Como `canDoMatch`, para las rutas hijas del evento: el contexto lo fija el guard de la ruta del
 * evento, que corre antes. Sin permiso, vuelve al resumen del evento.
 */
export function canDoActivate(accion: AccionEvento): CanActivateFn {
  return (ruta) => {
    const contexto = inject(ContextoEventoService);
    if (contexto.canDo(accion)) {
      return true;
    }
    const eventoId = ruta.parent?.paramMap.get('id') ?? contexto.eventoId();
    return inject(Router).createUrlTree(eventoId ? ['/eventos', eventoId] : ['/eventos']);
  };
}
