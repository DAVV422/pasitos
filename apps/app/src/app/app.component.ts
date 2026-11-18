import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AvisoComponent, EncabezadoComponent } from '@pasitos/ui';
import { filter, map } from 'rxjs';
import { formatHace } from './formato';
import { NavegacionComponent } from './navegacion.component';
import { PreferenciasService } from './preferencias';
import { SesionAsistente } from './sesion-asistente';

/** Las pantallas sin barra: antes de tener la entrada o al perderla. */
const SIN_BARRA = /^\/(acceso|sin-acceso|anulado|sin-conexion)(\/|$)/;

/**
 * Raíz de la app del asistente (Aplicaciones web §2, HU-308 §3 y §4): el encabezado, las franjas
 * de *pausado* y *sin conexión*, la pantalla de la ruta y la barra inferior.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, EncabezadoComponent, NavegacionComponent, RouterOutlet],
  template: `
    <px-encabezado />
    @if (conBarra()) {
      @if (sesion.estado()?.evento?.estado === 'pausado') {
        <div class="sticky top-0 z-10 px-5 pt-2">
          <px-aviso variante="advertencia">Pausamos un momento. Tus puntos están seguros.</px-aviso>
        </div>
      }
      @if (sesion.sinConexion()) {
        <div class="sticky top-0 z-10 px-5 pt-2">
          <px-aviso variante="advertencia"
            >Sin conexión · actualizado {{ hace() }}. Tus puntos están a salvo.</px-aviso
          >
        </div>
      }
    }
    <main
      class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-6"
      [class.pb-28]="conBarra()"
      [class.pb-10]="!conBarra()"
    >
      <router-outlet />
    </main>
    @if (conBarra()) {
      <app-navegacion [activas]="!motivo()" [motivo]="motivo() ?? ''" />
    }
  `,
})
export class AppComponent {
  protected readonly sesion = inject(SesionAsistente);
  private readonly router = inject(Router);
  /** Aplica el tema y el tamaño de texto guardados al abrir. */
  private readonly preferencias = inject(PreferenciasService);
  private readonly ruta = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly ahora = signal(Date.now());

  protected readonly conBarra = computed(
    () => this.sesion.estado() !== null && !SIN_BARRA.test(this.ruta()),
  );

  /** Por qué no se puede escanear ni canjear ahora; `null` si se puede. */
  protected readonly motivo = computed(() => {
    const estado = this.sesion.estado()?.evento.estado;
    if (this.sesion.sinConexion()) return 'Necesitas conexión';
    if (estado === 'pausado') return 'El evento está en pausa';
    if (estado === 'cerrado') return 'El evento terminó';
    if (estado !== 'en_curso') return 'El evento todavía no empezó';
    return null;
  });

  protected readonly hace = computed(() => {
    const desde = this.sesion.actualizadoAt();
    return desde ? formatHace(desde, this.ahora()) : '';
  });

  constructor() {
    setInterval(() => this.ahora.set(Date.now()), 30_000);
  }
}
