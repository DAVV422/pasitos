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
import {
  AvisoComponent,
  BotonDirective,
  ChipComponent,
  EstadoComponent,
  IconoComponent,
} from '@pasitos/ui';
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
    ChipComponent,
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
            @if (e.vencidos > 0) {
              <!-- HU-401 §6 -->
              <p class="text-muted" data-testid="vencidos">
                Tus {{ e.vencidos }} {{ e.evento.nombrePuntos }} vencieron al cierre.
              </p>
            }
          }
        }

        <div
          class="border-line bg-surface relative overflow-hidden rounded-xl border p-5"
          [class.border-points]="cambio()"
          aria-live="polite"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-muted text-sm">Tus {{ e.evento.nombrePuntos }}</p>
              <p
                class="font-display text-points text-5xl font-extrabold tabular-nums transition-transform duration-500"
                [class.scale-110]="cambio()"
                [class.text-muted]="e.evento.estado === 'cerrado'"
                data-testid="saldo"
              >
                {{ e.saldo }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2">
              @if (e.evento.estado !== 'cerrado') {
                <px-chip variante="atenuado">Vence al cierre</px-chip>
              }
              <svg
                viewBox="0 0 64 64"
                class="h-10 w-10 opacity-20"
                aria-hidden="true"
                focusable="false"
              >
                <svg:path
                  d="M13 11 L32 32 L13 53"
                  fill="none"
                  stroke="var(--logo-amarillo)"
                  stroke-width="9"
                />
                <svg:path
                  d="M32 11 L51 32 L32 53"
                  fill="none"
                  stroke="var(--logo-naranja)"
                  stroke-width="9"
                />
              </svg>
            </div>
          </div>
          @if (retos().length > 0) {
            <div class="bg-track mt-3 h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
              <div
                class="bg-points-fill h-full rounded-full transition-[width] duration-200"
                [style.width.%]="(grupos().completados.length * 100) / retos().length"
              ></div>
            </div>
          }
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p class="text-muted">
              {{ grupos().completados.length }} de {{ retos().length }} retos
            </p>
            <a
              routerLink="/info"
              fragment="como-puntos"
              class="text-points inline-flex items-center gap-1 font-semibold underline"
            >
              <px-icono nombre="info" [tamano]="16" />¿Cómo funciona?
            </a>
          </div>
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
          @if (e.evento.pedirCelular === 'obligatorio' && !e.asistente.celularCargado) {
            <!-- HU-411: no bloquea; quien vino de la lista lo completa en Mis datos. -->
            <px-aviso variante="info" data-testid="completa-celular">
              El organizador pide tu celular.
              <a class="font-semibold underline" routerLink="/cuenta/datos"
                >Complétalo en Mis datos</a
              >
            </px-aviso>
          }
          @if (e.evento.requiereCheckIn && e.asistente.estado !== 'presente') {
            <div class="border-points bg-pts-bg/25 flex flex-col gap-3 rounded-xl border-2 p-4">
              <p class="font-semibold">Pasa por la puerta para empezar a ganar puntos.</p>
              <a pxBoton routerLink="/mi-entrada">
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
