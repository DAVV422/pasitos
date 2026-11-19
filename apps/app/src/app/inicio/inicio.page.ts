import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getAhoraYSiguiente } from '@pasitos/dominio';
import { AvisoComponent, BotonDirective, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { formatDiaYHora, formatFalta, formatHora } from '../formato';
import { RetoTarjetaComponent } from '../retos/reto-tarjeta.component';
import { getRetosVista, groupRetos } from '../retos-vista';
import { SesionAsistente } from '../sesion-asistente';

/**
 * *Inicio* (HU-308 §2, mockups A2, A18 y A19): el saldo que confirma el servidor, lo que pasa
 * ahora y los retos para hacer. Antes de empezar, la cuenta regresiva; al cerrar, el resumen.
 */
@Component({
  selector: 'app-inicio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    EstadoComponent,
    IconoComponent,
    RetoTarjetaComponent,
    RouterLink,
  ],
  template: `
    @if (sesion.estado(); as e) {
      @let zona = e.evento.zonaHoraria;
      <section class="flex flex-col gap-4">
        @if (sesion.avisoFoto(); as a) {
          <!-- HU-323. -->
          <px-aviso [variante]="a.variante" role="status">{{ a.texto }}</px-aviso>
        }
        @if (sesion.bienvenida(); as texto) {
          <!-- HU-320: recién registrada con un QR. -->
          <px-aviso variante="ok" role="status">{{ texto }}</px-aviso>
        }
        @if (e.evento.estado === 'publicado') {
          <!-- A19: el evento todavía no empezó -->
          <div class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-5">
            <h1 class="text-3xl font-extrabold">¡Hola, {{ primerNombre() }}!</h1>
            <p class="flex items-start gap-3 text-lg">
              <px-icono nombre="cal" [tamano]="22" />
              <span
                ><b>{{ e.evento.nombre }}</b> empieza el
                <b>{{ diaYHora(e.evento.inicioAt, zona) }}</b>.</span
              >
            </p>
            <p class="text-muted" aria-live="off">Faltan {{ falta() }}.</p>
          </div>
          <p class="text-center">Vuelve a abrir Pasitos ese día. Tus retos te estarán esperando.</p>
        } @else {
          <p class="text-muted">{{ e.evento.nombre }}</p>
          @if (e.evento.estado === 'cerrado') {
            <!-- A18 -->
            <px-aviso variante="ok">{{ e.evento.nombre }} terminó. ¡Gracias por quedarte!</px-aviso>
          }
        }

        <div
          class="border-line bg-surface rounded-xl border p-5"
          [class.border-points]="cambio()"
          aria-live="polite"
        >
          <p class="text-muted text-sm">Tus {{ e.evento.nombrePuntos }}</p>
          <p
            class="font-display text-5xl font-extrabold transition-transform duration-500"
            [class.scale-110]="cambio()"
            [class.text-points]="cambio()"
            [class.text-muted]="e.evento.estado === 'cerrado'"
            data-testid="saldo"
          >
            {{ e.saldo }}
          </p>
          <p class="text-muted mt-2 text-sm">
            {{ grupos().completados.length }} de {{ retos().length }} retos
          </p>
        </div>

        @if (e.evento.estado === 'cerrado') {
          @if (grupos().completados.length > 0) {
            <h2 class="text-xl font-bold">Tus retos completados</h2>
            @for (reto of grupos().completados; track reto.id) {
              <app-reto-tarjeta [reto]="reto" [zona]="zona" [accion]="false" />
            }
          }
          <a pxBoton="secundario" routerLink="/historial">Ver mi historial</a>
        } @else {
          @if (e.evento.requiereCheckIn && e.asistente.estado !== 'presente') {
            <div class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
              <p class="font-semibold">Pasa por la puerta para empezar a ganar puntos.</p>
              <a pxBoton="secundario" routerLink="/mi-entrada">
                <px-icono nombre="ticket" [tamano]="20" />Mi entrada
              </a>
            </div>
          }

          @if (sesion.aviso(); as aviso) {
            <px-aviso variante="info">{{ aviso }}</px-aviso>
          }

          @if (agenda().ahora || agenda().siguiente) {
            <section class="flex flex-col gap-2" aria-label="Ahora y a continuación">
              <div class="flex justify-end">
                <a routerLink="/agenda" class="text-points font-semibold underline"
                  >Ver la agenda</a
                >
              </div>
              @for (fila of filasAgenda(); track fila.actividad.id) {
                <div class="border-line bg-surface rounded-xl border p-4">
                  <p class="text-muted text-sm font-semibold uppercase">
                    {{ fila.etiqueta }} · {{ hora(fila.actividad.inicioAt, zona) }}
                  </p>
                  <p class="text-lg font-bold">{{ fila.actividad.titulo }}</p>
                  @if (fila.actividad.lugar) {
                    <p class="text-muted text-sm">{{ fila.actividad.lugar }}</p>
                  }
                  @if (fila.puntos) {
                    <p class="text-points text-sm font-semibold">
                      Esta charla da +{{ fila.puntos }}
                    </p>
                  }
                </div>
              }
            </section>
          }

          <section class="flex flex-col gap-3" aria-labelledby="retos-titulo">
            <div class="flex items-center justify-between">
              <h2 id="retos-titulo" class="text-xl font-bold">Retos</h2>
              <a routerLink="/retos" class="text-points font-semibold underline">Ver todos</a>
            </div>
            @if (!sesion.evento()) {
              <px-estado tipo="cargando" titulo="Cargando los retos…" />
            } @else if (destacados().length === 0) {
              <p class="text-muted">
                @if (retos().length === 0) {
                  Todavía no hay retos en este evento.
                } @else {
                  No hay retos para hacer ahora. Mira los que vienen en Retos.
                }
              </p>
            } @else {
              @for (reto of destacados(); track reto.id) {
                <app-reto-tarjeta [reto]="reto" [zona]="zona" [accion]="puedeActuar()" />
              }
            }
          </section>
        }
      </section>
    } @else {
      <px-estado tipo="cargando" titulo="Cargando…" />
    }
  `,
})
export class InicioPage {
  protected readonly sesion = inject(SesionAsistente);
  private readonly ahora = signal(Date.now());

  protected readonly primerNombre = computed(
    () => this.sesion.estado()?.asistente.nombre.split(' ')[0] ?? '',
  );
  protected readonly retos = computed(() =>
    getRetosVista(this.sesion.estado(), this.sesion.evento()),
  );
  protected readonly grupos = computed(() => groupRetos(this.retos()));
  /** Hasta 3 para hacer ahora (HU-308 §2). */
  protected readonly destacados = computed(() => this.grupos().porHacer.slice(0, 3));
  protected readonly puedeActuar = computed(
    () => this.sesion.estado()?.evento.estado === 'en_curso' && !this.sesion.sinConexion(),
  );
  protected readonly agenda = computed(() =>
    getAhoraYSiguiente(this.sesion.evento()?.agenda ?? [], new Date(this.ahora())),
  );
  protected readonly filasAgenda = computed(() => {
    const { ahora, siguiente } = this.agenda();
    const puntosDe = (retoId: string | null) =>
      retoId ? (this.sesion.evento()?.retos.find((r) => r.id === retoId)?.puntos ?? null) : null;
    return [
      ...(ahora ? [{ etiqueta: 'Ahora', actividad: ahora, puntos: puntosDe(ahora.retoId) }] : []),
      ...(siguiente
        ? [{ etiqueta: 'A continuación', actividad: siguiente, puntos: puntosDe(siguiente.retoId) }]
        : []),
    ];
  });
  protected readonly falta = computed(() => {
    const inicio = this.sesion.estado()?.evento.inicioAt;
    return inicio ? formatFalta(Date.parse(inicio) - this.ahora()) : '';
  });

  /** El saldo se anima un momento cuando cambia (`saldo.actualizado`). */
  protected readonly cambio = signal(false);

  protected readonly hora = formatHora;
  protected readonly diaYHora = formatDiaYHora;

  constructor() {
    // La bienvenida del autorregistro se muestra una sola vez.
    inject(DestroyRef).onDestroy(() => {
      this.sesion.bienvenida.set(null);
      this.sesion.avisoFoto.set(null);
    });

    const reloj = setInterval(() => this.ahora.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));

    let anterior: number | null = null;
    let apagar: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const saldo = this.sesion.estado()?.saldo ?? null;
      if (anterior !== null && saldo !== null && saldo !== anterior) {
        this.cambio.set(true);
        clearTimeout(apagar);
        apagar = setTimeout(() => this.cambio.set(false), 900);
      }
      anterior = saldo;
    });
  }
}
