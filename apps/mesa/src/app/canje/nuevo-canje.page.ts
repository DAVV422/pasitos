import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AvisoComponent,
  BotonDirective,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
} from '@pasitos/ui';
import { EnVivoService, ErrorApi } from '@pasitos/web-core';
import { MesaApi, type PremioMesa } from '../mesa-api.service';

/**
 * *Nuevo canje* (HU-316 §3, mockup M1): el catálogo en grilla grande, las cantidades y el total.
 * La mesa necesita conexión (D21): sin red, no deja cobrar.
 */
@Component({
  selector: 'mesa-nuevo-canje-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    ChipComponent,
    EstadoComponent,
    IconoComponent,
    RouterLink,
  ],
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-extrabold">Nuevo canje</h1>
      <a routerLink="/historial" class="text-points font-semibold underline">Historial</a>
    </header>
    @if (sinRed()) {
      <px-aviso variante="peligro">Sin conexión: no se puede cobrar.</px-aviso>
    }
    @for (aviso of stockBajo(); track aviso) {
      <px-aviso variante="advertencia">{{ aviso }}</px-aviso>
    }
    @if (catalogo(); as premios) {
      @if (premios.length === 0) {
        <px-estado tipo="vacio" titulo="No hay premios en el catálogo." />
      } @else {
        <ul class="grid grid-cols-2 gap-3 md:grid-cols-3">
          @for (p of premios; track p.id) {
            <li class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-3">
              @if (p.imagenUrl) {
                <img
                  [src]="p.imagenUrl"
                  alt=""
                  class="aspect-square w-full rounded-lg object-cover"
                  loading="lazy"
                />
              }
              <p class="text-lg leading-tight font-bold">{{ p.nombre }}</p>
              <p class="text-points font-display text-xl font-extrabold">{{ p.puntos }} pts</p>
              <p class="text-muted text-sm">
                @if (p.disponible === 0) {
                  <px-chip variante="peligro">Agotado</px-chip>
                } @else {
                  Quedan {{ p.disponible }}
                  @if (p.pocos) {
                    <px-chip variante="puntos">Pocos</px-chip>
                  }
                }
              </p>
              <div class="flex items-center justify-between gap-2">
                <button
                  pxBoton="secundario"
                  type="button"
                  class="h-12 w-12"
                  [attr.aria-label]="'Quitar ' + p.nombre"
                  [deshabilitado]="cantidad(p.id) === 0"
                  (click)="change(p, -1)"
                >
                  −
                </button>
                <span
                  class="font-display text-2xl font-extrabold"
                  [attr.aria-label]="'Cantidad de ' + p.nombre"
                  >{{ cantidad(p.id) }}</span
                >
                <button
                  pxBoton="secundario"
                  type="button"
                  class="h-12 w-12"
                  [attr.aria-label]="'Agregar ' + p.nombre"
                  [deshabilitado]="cantidad(p.id) >= p.disponible"
                  (click)="change(p, 1)"
                >
                  +
                </button>
              </div>
            </li>
          }
        </ul>
        <footer class="bg-bg sticky bottom-0 flex items-center justify-between gap-3 py-4">
          <p class="font-display text-3xl font-extrabold" data-testid="total">
            Total: {{ total() }} pts
          </p>
          <button
            pxBoton
            type="button"
            class="min-h-14 text-xl"
            [deshabilitado]="total() === 0 || sinRed()"
            [cargando]="cobrando()"
            (click)="cobrar()"
          >
            <px-icono nombre="puntos" [tamano]="22" />Cobrar
          </button>
        </footer>
      }
    } @else if (error(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    } @else {
      <px-estado tipo="cargando" />
    }
    @if (errorCobro(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    }
  `,
})
export class NuevoCanjePage {
  private readonly api = inject(MesaApi);
  private readonly router = inject(Router);

  protected readonly catalogo = signal<readonly PremioMesa[] | null>(null);
  protected readonly cantidades = signal<Readonly<Record<string, number>>>({});
  protected readonly cobrando = signal(false);
  protected readonly sinRed = signal(!navigator.onLine);
  protected readonly error = signal<string | null>(null);
  protected readonly errorCobro = signal<string | null>(null);
  protected readonly stockBajo = signal<readonly string[]>([]);
  private clave = crypto.randomUUID();

  protected readonly total = computed(() =>
    (this.catalogo() ?? []).reduce(
      (suma, p) => suma + p.puntos * (this.cantidades()[p.id] ?? 0),
      0,
    ),
  );

  constructor() {
    void this.load();
    const alCambiarRed = () => this.sinRed.set(!navigator.onLine);
    addEventListener('online', alCambiarRed);
    addEventListener('offline', alCambiarRed);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      removeEventListener('online', alCambiarRed);
      removeEventListener('offline', alCambiarRed);
    });
    const canal = inject(EnVivoService).connect('/api/v1/mesa/en-vivo', ['stock.bajo'], destroy);
    canal.on('stock.bajo', (aviso) => {
      const datos = aviso.datos as { nombre?: string; disponible?: number } | null;
      if (datos?.nombre) {
        this.stockBajo.update((lista) => [
          ...lista.filter((t) => !t.startsWith(datos.nombre ?? '')),
          `${datos.nombre}: quedan ${datos.disponible ?? 0}.`,
        ]);
      }
      void this.load();
    });
  }

  protected cantidad(id: string): number {
    return this.cantidades()[id] ?? 0;
  }

  protected change(premio: PremioMesa, delta: number): void {
    const actual = this.cantidad(premio.id);
    const nueva = Math.max(0, Math.min(premio.disponible, actual + delta));
    this.cantidades.set({ ...this.cantidades(), [premio.id]: nueva });
    this.clave = crypto.randomUUID();
  }

  protected async cobrar(): Promise<void> {
    if (this.cobrando()) return;
    this.cobrando.set(true);
    this.errorCobro.set(null);
    try {
      const items = Object.entries(this.cantidades())
        .filter(([, cantidad]) => cantidad > 0)
        .map(([premioId, cantidad]) => ({ premioId, cantidad }));
      const cobro = await this.api.createCobro(items, this.clave);
      await this.router.navigate(['/cobro', cobro.id], { state: { cobro } });
    } catch (error) {
      this.errorCobro.set(
        error instanceof ErrorApi ? error.detail : 'No pudimos cobrar. Intenta de nuevo.',
      );
      this.clave = crypto.randomUUID();
      void this.load();
    } finally {
      this.cobrando.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      this.catalogo.set(await this.api.getCatalogo());
      this.error.set(null);
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'TERMINAL_DESCONECTADA') {
        await this.router.navigate(['/']);
        return;
      }
      this.error.set(error instanceof ErrorApi ? error.detail : 'No pudimos cargar el catálogo.');
    }
  }
}
