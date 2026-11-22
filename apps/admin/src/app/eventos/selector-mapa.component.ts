import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BotonDirective, CampoComponent } from '@pasitos/ui';
import type * as Leaflet from 'leaflet';

export interface PuntoMapa {
  readonly lat: number;
  readonly lng: number;
}

/** Sin punto todavía: el centro de La Paz, lejos. */
const CENTRO_INICIAL: PuntoMapa = { lat: -16.5, lng: -68.15 };

/**
 * El CSS de Leaflet va aparte (`vendor/leaflet.css`, copiado al compilar): pasa el límite de
 * estilos de un componente y solo hace falta en esta pestaña.
 */
function loadEstilosLeaflet(): void {
  if (document.getElementById('estilos-leaflet')) return;
  const enlace = document.createElement('link');
  enlace.id = 'estilos-leaflet';
  enlace.rel = 'stylesheet';
  enlace.href = `${document.baseURI}vendor/leaflet.css`;
  document.head.appendChild(enlace);
}

/** Buscar una dirección en OpenStreetMap (Nominatim): un pedido por búsqueda, a mano. */
async function searchDireccion(texto: string): Promise<PuntoMapa | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', texto);
  const respuesta = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  if (!respuesta.ok) return null;
  const [primero] = (await respuesta.json()) as { lat: string; lon: string }[];
  return primero ? { lat: Number(primero.lat), lng: Number(primero.lon) } : null;
}

/**
 * Elegir la ubicación del evento en un mapa (Configuración → Ubicación): tocar el lugar o arrastrar
 * el marcador, o buscar una dirección. Usa Leaflet con los mapas de OpenStreetMap (sin llave); se
 * carga solo al abrir esta pestaña.
 */
@Component({
  selector: 'adm-selector-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective, CampoComponent],
  template: `
    <div class="flex flex-col gap-2">
      <form class="flex flex-wrap items-end gap-2" (submit)="buscar($event)">
        <px-campo etiqueta="Buscar en el mapa" class="min-w-0 flex-1" #cb="pxCampo">
          <input
            [id]="cb.idControl"
            type="search"
            maxlength="200"
            placeholder="Por ejemplo: Plaza Murillo, La Paz"
            data-testid="buscar-mapa"
            [value]="consulta()"
            (input)="consulta.set($any($event.target).value)"
          />
        </px-campo>
        <button type="submit" pxBoton="secundario" [cargando]="buscando()">Buscar</button>
      </form>
      @if (aviso(); as a) {
        <p class="text-muted text-sm" role="status">{{ a }}</p>
      }
      <div
        #mapa
        class="border-line h-80 w-full overflow-hidden rounded-xl border"
        data-testid="selector-mapa"
        role="application"
        aria-label="Mapa: toca el lugar del evento"
      ></div>
      <p class="text-muted text-xs">Toca el lugar del evento o arrastra el marcador.</p>
    </div>
  `,
})
export class SelectorMapaComponent {
  /** El punto guardado (o el que se está escribiendo a mano). */
  readonly punto = input<PuntoMapa | null>(null);
  readonly cambio = output<PuntoMapa>();

  protected readonly consulta = signal('');
  protected readonly buscando = signal(false);
  protected readonly aviso = signal<string | null>(null);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private leaflet: typeof Leaflet | null = null;
  private mapa: Leaflet.Map | null = null;
  private marcador: Leaflet.Marker | null = null;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      void this.init().then(() => destroy.onDestroy(() => this.mapa?.remove()));
    });
    // Si el punto cambia desde afuera (escrito a mano), el marcador lo sigue.
    effect(() => {
      const punto = this.punto();
      if (punto && this.mapa) this.setMarcador(punto, false);
    });
  }

  private async init(): Promise<void> {
    loadEstilosLeaflet();
    // Leaflet es CommonJS: según cómo se empaquete, sus funciones vienen en `default`.
    const modulo = (await import('leaflet')) as typeof Leaflet & { default?: typeof Leaflet };
    const L = modulo.default ?? modulo;
    this.leaflet = L;
    const inicial = this.punto();
    this.mapa = L.map(this.contenedor().nativeElement, {
      center: inicial ?? CENTRO_INICIAL,
      zoom: inicial ? 16 : 12,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© colaboradores de OpenStreetMap',
    }).addTo(this.mapa);
    if (inicial) this.setMarcador(inicial, false);
    this.mapa.on('click', (evento: Leaflet.LeafletMouseEvent) =>
      this.elegir({ lat: evento.latlng.lat, lng: evento.latlng.lng }),
    );
  }

  private setMarcador(punto: PuntoMapa, centrar: boolean): void {
    const L = this.leaflet;
    if (!L || !this.mapa) return;
    if (!this.marcador) {
      // Un círculo con los colores del panel: sin las imágenes del marcador por defecto.
      const icono = L.divIcon({
        className: 'adm-marcador-mapa',
        html: '<span class="bg-points border-surface block h-5 w-5 rounded-full border-4 shadow-md"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      this.marcador = L.marker(punto, { draggable: true, icon: icono, keyboard: true }).addTo(
        this.mapa,
      );
      this.marcador.on('dragend', () => {
        const posicion = this.marcador?.getLatLng();
        if (posicion) this.elegir({ lat: posicion.lat, lng: posicion.lng });
      });
    } else {
      this.marcador.setLatLng(punto);
    }
    if (centrar) this.mapa.setView(punto, Math.max(this.mapa.getZoom(), 16));
  }

  private elegir(punto: PuntoMapa): void {
    const redondeado = {
      lat: Math.round(punto.lat * 1e6) / 1e6,
      lng: Math.round(punto.lng * 1e6) / 1e6,
    };
    this.setMarcador(redondeado, false);
    this.cambio.emit(redondeado);
  }

  protected async buscar(evento: Event): Promise<void> {
    evento.preventDefault();
    const texto = this.consulta().trim();
    if (texto.length < 3 || this.buscando()) return;
    this.buscando.set(true);
    this.aviso.set(null);
    try {
      const punto = await searchDireccion(texto);
      if (!punto) {
        this.aviso.set('No encontramos esa dirección. Prueba con otra o toca el lugar en el mapa.');
        return;
      }
      this.mapa?.setView(punto, 17);
      this.aviso.set('Toca el lugar exacto para marcarlo.');
    } catch {
      this.aviso.set('No pudimos buscar ahora. Toca el lugar en el mapa.');
    } finally {
      this.buscando.set(false);
    }
  }
}
