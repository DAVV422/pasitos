import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { AvisoComponent, BotonDirective, IconoComponent } from '@pasitos/ui';
import { achicarImagen } from '@pasitos/web-core';
import { SesionAsistente } from '../sesion-asistente';
import type { RetoVista } from '../retos-vista';
import { FotosService } from './fotos.service';

/**
 * La foto de un reto (HU-322 §5): sacarla o subirla de la galería, verla antes de mandar, la
 * autorización de uso y el estado (*Enviando*, *En revisión*, *Aprobada*, *Rechazada*). Se carga
 * con `@defer` al abrir un reto de foto: el achicador no va en el paquete inicial.
 */
@Component({
  selector: 'app-foto-reto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, IconoComponent],
  template: `
    @let r = reto();
    <section class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
      @if (r.autorizacionUso === 'requerida') {
        <px-aviso variante="info">Este reto es para difusión.</px-aviso>
      }
      <p class="font-semibold">{{ r.instruccionFoto }}</p>

      @switch (estadoActual()) {
        @case ('enviando') {
          <p aria-live="polite">Enviando… {{ envio()?.progreso ?? 0 }} %</p>
        }
        @case ('sin_conexion') {
          <px-aviso variante="advertencia" role="status">
            Enviando… (sin conexión). La mandamos sola cuando vuelva la señal.
          </px-aviso>
        }
        @case ('en_revision') {
          <p class="flex items-center gap-2 font-semibold" role="status">
            <px-icono nombre="clock" [tamano]="18" />En revisión
          </p>
        }
        @case ('aprobada') {
          <p class="text-success flex items-center gap-2 font-bold" role="status">
            <px-icono nombre="check" [tamano]="18" />¡Aprobada! +{{ r.puntos }}
          </p>
        }
        @default {
          @if (envio()?.error; as e) {
            <px-aviso variante="peligro" role="alert">{{ e }}</px-aviso>
          }
          @if (r.estadoPersona.foto; as f) {
            @if (f.estado === 'rechazada' || f.estado === 'rechazada_sistema') {
              <px-aviso variante="advertencia">Rechazada: {{ f.motivo ?? 'sin motivo' }}</px-aviso>
            }
          }
          @if (puedeEnviar()) {
            @if (intentosRestantes() !== null) {
              <p class="text-muted text-sm">
                Te {{ intentosRestantes() === 1 ? 'queda' : 'quedan' }} {{ intentosRestantes() }}
                {{ intentosRestantes() === 1 ? 'intento' : 'intentos' }}
              </p>
            }
            @if (vista(); as v) {
              <img [src]="v.url" alt="Tu foto, antes de mandarla" class="w-full rounded-lg" />
              <label class="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  class="mt-1 h-5 w-5"
                  [checked]="autoriza()"
                  (change)="autoriza.set(!autoriza())"
                />
                <span>
                  Acepto que el organizador de {{ evento() }} y Pasitos usen esta foto en sus redes
                  y su difusión del evento. Si en la foto hay menores de edad, la mando con el
                  permiso de sus padres o tutores.
                </span>
              </label>
              <p class="text-muted text-sm">
                Tu foto la ven el equipo del reto y el organizador para darte los puntos.
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" pxBoton="secundario" (click)="discard()">Otra</button>
                <button
                  type="button"
                  pxBoton
                  [disabled]="r.autorizacionUso === 'requerida' && !autoriza()"
                  (click)="send()"
                >
                  Enviar
                </button>
              </div>
            } @else {
              <button type="button" pxBoton [bloque]="true" (click)="camara.click()">
                <px-icono nombre="scan" [tamano]="20" />Sacar foto
              </button>
              <input
                #camara
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                (change)="choose($event, 'camara')"
              />
              @if (r.permiteGaleria) {
                <button
                  type="button"
                  pxBoton="secundario"
                  [bloque]="true"
                  (click)="galeria.click()"
                >
                  <px-icono nombre="image" [tamano]="20" />Subir de la galería
                </button>
                <input
                  #galeria
                  type="file"
                  accept="image/*"
                  class="sr-only"
                  tabindex="-1"
                  aria-hidden="true"
                  (change)="choose($event, 'galeria')"
                />
              }
              @if (preparando()) {
                <p class="text-muted text-sm" aria-live="polite">Preparando la foto…</p>
              }
            }
          } @else if (intentosRestantes() === 0) {
            <p class="text-muted">Ya usaste todos los intentos de este reto.</p>
          }
        }
      }
    </section>
  `,
})
export class FotoRetoComponent {
  readonly reto = input.required<RetoVista>();
  readonly accion = input(true);

  private readonly fotos = inject(FotosService);
  private readonly sesion = inject(SesionAsistente);
  protected readonly vista = signal<{
    url: string;
    foto: Blob;
    origen: 'camara' | 'galeria';
  } | null>(null);
  protected readonly autoriza = signal(false);
  protected readonly preparando = signal(false);
  protected readonly evento = computed(() => this.sesion.estado()?.evento.nombre ?? 'el evento');
  protected readonly envio = computed(() => this.fotos.envios()[this.reto().id] ?? null);
  /** Lo que se ve: el envío en curso manda; si no, el estado que dice el servidor. */
  protected readonly estadoActual = computed(() => {
    const envio = this.envio();
    if (envio && envio.fase !== 'error') return envio.fase;
    const foto = this.reto().estadoPersona.foto;
    if (foto?.estado === 'recibida' || foto?.estado === 'en_revision') return 'en_revision';
    if (foto?.estado === 'aprobada' && this.reto().estadoPersona.estado === 'completado') {
      return 'aprobada';
    }
    return 'elegir';
  });
  protected readonly intentosRestantes = computed(
    () => this.reto().estadoPersona.foto?.intentosRestantes ?? this.reto().intentosMax,
  );
  protected readonly puedeEnviar = computed(
    () =>
      this.accion() &&
      this.reto().estadoPersona.estado === 'disponible' &&
      (this.intentosRestantes() ?? 1) > 0,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.discard());
  }

  protected async choose(evento: Event, origen: 'camara' | 'galeria'): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.preparando.set(true);
    try {
      const foto = await achicarImagen(archivo);
      this.discard();
      this.vista.set({ url: URL.createObjectURL(foto), foto, origen });
      this.fotos.clearEstado(this.reto().id);
    } catch {
      this.fotos.clearEstado(this.reto().id);
    } finally {
      this.preparando.set(false);
    }
  }

  protected discard(): void {
    const actual = this.vista();
    if (actual) URL.revokeObjectURL(actual.url);
    this.vista.set(null);
  }

  protected async send(): Promise<void> {
    const actual = this.vista();
    if (!actual) return;
    this.discard();
    await this.fotos.send(this.reto().id, actual.foto, actual.origen, this.autoriza());
    this.autoriza.set(false);
  }
}
