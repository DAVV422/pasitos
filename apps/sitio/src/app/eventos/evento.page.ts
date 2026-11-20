import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  makeStateKey,
  PendingTasks,
  RESPONSE_INIT,
  signal,
  TransferState,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { BotonDirective } from '@pasitos/ui';
import { FUENTE_EVENTO, type EventoPagina } from './fuente-evento';

interface Estado {
  readonly evento: EventoPagina | null;
  readonly error: boolean;
}

const formato = (zona: string, opciones: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-BO', { timeZone: zona, ...opciones });

/** *"Sábado 5 de diciembre · 9:00 a 18:00"*, en la zona del evento (24 horas, sin coma). */
function formatFecha(inicio: string, fin: string, zona: string): string {
  const desde = new Date(inicio);
  const semana = formato(zona, { weekday: 'long' }).format(desde);
  const dia = formato(zona, { day: 'numeric', month: 'long' }).format(desde);
  const hora = formato(zona, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${dia} · ${hora.format(desde)} a ${hora.format(new Date(fin))}`;
}

/**
 * La página pública del evento (HU-406, inventario P5): las secciones que el organizador marcó
 * públicas, *Cómo entrar* e *Ir a mi entrada*. Sin página pública (privado, borrador o un enlace
 * inventado), *"Este evento no tiene página pública"* con un `404` de verdad (P7).
 */
@Component({
  selector: 'sit-evento-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective],
  host: { class: 'flex flex-col gap-8' },
  template: `
    @if (estado(); as s) {
      @if (s.evento; as e) {
        <header class="flex flex-col gap-4">
          @if (e.portada) {
            <img
              [src]="e.portada"
              alt=""
              width="1200"
              height="400"
              class="aspect-[3/1] w-full rounded-2xl object-cover"
            />
          }
          <div class="flex items-center gap-4">
            @if (e.logo) {
              <img [src]="e.logo" alt="" width="64" height="64" class="h-16 w-16 rounded-xl" />
            }
            <div class="flex flex-col gap-1">
              <h1 class="text-4xl font-extrabold tracking-tight">{{ e.nombre }}</h1>
              <p class="text-muted">Organiza {{ e.organizacion }}</p>
            </div>
          </div>
          @if (e.estado === 'en_curso') {
            <p class="text-success font-bold">En curso</p>
          }
          @if (e.fecha; as f) {
            <p class="text-lg" data-testid="fecha">
              {{ fecha(f.inicioAt, f.finAt, e.zonaHoraria) }}
            </p>
          }
          @if (e.lugar; as l) {
            <p class="text-muted">{{ l.nombre }}{{ l.direccion ? ' · ' + l.direccion : '' }}</p>
          }
        </header>

        @if (e.estado !== 'terminado') {
          <section
            class="border-points flex flex-col gap-2 rounded-2xl border-2 p-6"
            aria-labelledby="como-entrar"
          >
            @if (vinculado()) {
              <h2 id="como-entrar" class="text-2xl font-extrabold">Ya tienes tu entrada</h2>
              <div><a pxBoton href="/app/" data-testid="ir-a-mi-entrada">Ir a mi entrada</a></div>
            } @else {
              <h2 id="como-entrar" class="text-2xl font-extrabold">Cómo entrar</h2>
              <p>¿Te invitaron? Abre el enlace de tu correo en el celular.</p>
              @if (e.comoEntrar.qrRegistro) {
                <p>En la entrada vas a encontrar un QR para registrarte con tu celular.</p>
              }
              @if (e.comoEntrar.registroPuerta) {
                <p>También puedes registrarte en la puerta.</p>
              }
            }
          </section>
        } @else {
          <p class="text-muted">Este evento ya terminó.</p>
        }

        @if (e.descripcion) {
          <section class="flex flex-col gap-2" aria-label="Descripción">
            <p class="text-lg whitespace-pre-line">{{ e.descripcion }}</p>
          </section>
        }

        @if (e.lugar; as l) {
          @if (l.mapa) {
            <section class="flex flex-col gap-2" aria-labelledby="titulo-lugar">
              <h2 id="titulo-lugar" class="text-2xl font-extrabold">Dónde</h2>
              <img
                [src]="l.mapa"
                [alt]="'Mapa de ' + (l.nombre ?? 'el lugar')"
                width="1200"
                height="600"
                loading="lazy"
                class="w-full rounded-xl"
              />
              @if (l.enlaceMapa) {
                <a [href]="l.enlaceMapa" target="_blank" rel="noopener" class="underline"
                  >Cómo llegar</a
                >
              }
            </section>
          }
        }

        @if (e.agenda.length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="titulo-agenda">
            <h2 id="titulo-agenda" class="text-2xl font-extrabold">Agenda</h2>
            <ul class="flex flex-col gap-2">
              @for (a of e.agenda; track $index) {
                <li class="border-line bg-surface flex flex-col rounded-xl border p-4">
                  <span class="text-muted text-sm">{{ hora(a.inicioAt, e.zonaHoraria) }}</span>
                  <b>{{ a.titulo }}</b>
                  @if (a.expositor || a.lugar) {
                    <span class="text-muted text-sm"
                      >{{ a.expositor }}{{ a.expositor && a.lugar ? ' · ' : '' }}{{ a.lugar }}</span
                    >
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (e.retos.length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="titulo-retos">
            <h2 id="titulo-retos" class="text-2xl font-extrabold">Retos</h2>
            <ul class="grid gap-3 sm:grid-cols-2">
              @for (r of e.retos; track $index) {
                <li class="border-line bg-surface flex flex-col gap-1 rounded-xl border p-4">
                  <span class="flex justify-between gap-2"
                    ><b>{{ r.nombre }}</b
                    ><span class="text-points font-bold">+{{ r.puntos }}</span></span
                  >
                  @if (r.descripcion) {
                    <span class="text-muted text-sm">{{ r.descripcion }}</span>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (e.catalogo.length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="titulo-premios">
            <h2 id="titulo-premios" class="text-2xl font-extrabold">Premios</h2>
            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              @for (p of e.catalogo; track $index) {
                <li class="border-line bg-surface flex flex-col gap-1 rounded-xl border p-3">
                  @if (p.imagen) {
                    <img
                      [src]="p.imagen"
                      alt=""
                      width="400"
                      height="400"
                      loading="lazy"
                      class="aspect-square w-full rounded-lg object-cover"
                    />
                  }
                  <b>{{ p.nombre }}</b>
                  <span class="text-points text-sm font-bold">{{ p.puntos }} puntos</span>
                  @if (p.estado !== 'disponible') {
                    <span class="text-muted text-sm">{{
                      p.estado === 'agotado' ? 'Agotado' : 'Quedan pocos'
                    }}</span>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (e.sponsors.length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="titulo-sponsors">
            <h2 id="titulo-sponsors" class="text-2xl font-extrabold">Sponsors</h2>
            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              @for (s of e.sponsors; track $index) {
                <li class="border-line bg-surface flex flex-col gap-2 rounded-xl border p-4">
                  @if (s.logo) {
                    <img
                      [src]="s.logo"
                      alt=""
                      width="200"
                      height="100"
                      loading="lazy"
                      class="h-12 w-auto self-start"
                    />
                  }
                  @if (s.enlace) {
                    <a
                      [href]="s.enlace"
                      target="_blank"
                      rel="noopener"
                      class="font-bold underline"
                      >{{ s.nombre }}</a
                    >
                  } @else {
                    <b>{{ s.nombre }}</b>
                  }
                  @if (s.descripcion) {
                    <span class="text-muted text-sm">{{ s.descripcion }}</span>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (e.preguntas.length > 0) {
          <section class="flex flex-col gap-3" aria-labelledby="titulo-preguntas-evento">
            <h2 id="titulo-preguntas-evento" class="text-2xl font-extrabold">
              Preguntas frecuentes
            </h2>
            @for (p of e.preguntas; track $index) {
              <details class="border-line bg-surface rounded-xl border p-4">
                <summary class="cursor-pointer font-bold">{{ p.pregunta }}</summary>
                <p class="text-muted mt-2 whitespace-pre-line">{{ p.respuesta }}</p>
              </details>
            }
          </section>
        }

        @if (e.contacto) {
          <section class="flex flex-col gap-2" aria-labelledby="titulo-contacto-evento">
            <h2 id="titulo-contacto-evento" class="text-2xl font-extrabold">Contacto</h2>
            <p class="whitespace-pre-line">{{ e.contacto }}</p>
          </section>
        }
      } @else if (s.error) {
        <h1 class="text-4xl font-extrabold">No pudimos cargar el evento</h1>
        <p class="text-muted text-lg">Intenta de nuevo en un momento.</p>
      } @else {
        <!-- P7 -->
        <h1 class="text-4xl font-extrabold">Este evento no tiene página pública</h1>
        <p class="text-muted text-lg">
          Si te invitaron, abre el enlace de tu correo en el celular.
        </p>
        <div><a pxBoton="secundario" href="/eventos">Ver eventos</a></div>
      }
    } @else {
      <p class="text-muted">Cargando…</p>
    }
  `,
})
export class EventoPage {
  private readonly fuente = inject(FUENTE_EVENTO);
  private readonly transferido = inject(TransferState);
  private readonly respuesta = inject(RESPONSE_INIT, { optional: true });
  private readonly titulo = inject(Title);
  private readonly meta = inject(Meta);
  private readonly documento = inject(DOCUMENT);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  protected readonly fecha = formatFecha;
  protected readonly estado = signal<Estado | null>(null);
  protected readonly vinculado = signal(false);

  constructor() {
    const clave = makeStateKey<Estado>(`evento-${this.slug}`);
    const guardado = this.transferido.get(clave, null);
    if (guardado) {
      this.show(guardado);
    } else {
      // En el servidor, Angular espera esta tarea antes de mandar la página.
      void inject(PendingTasks).run(async () => {
        const estado = await this.load();
        this.transferido.set(clave, estado);
        this.show(estado);
      });
    }
    // *Ir a mi entrada* (HU-406 §4): solo en el navegador, después de mostrar la página.
    afterNextRender(() => {
      if (this.estado()?.evento?.estado === 'terminado') return;
      void fetch(`/api/v1/publico/eventos/${encodeURIComponent(this.slug)}/mi-entrada`)
        .then((r) => (r.ok ? (r.json() as Promise<{ vinculado: boolean }>) : null))
        .then((datos) => this.vinculado.set(datos?.vinculado === true))
        .catch(() => undefined);
    });
  }

  protected hora(iso: string, zona: string): string {
    return formato(zona, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  }

  private async load(): Promise<Estado> {
    try {
      return { evento: await this.fuente(this.slug), error: false };
    } catch {
      return { evento: null, error: true };
    }
  }

  /** Muestra el estado y arma lo que necesitan los buscadores y WhatsApp. */
  private show(estado: Estado): void {
    this.estado.set(estado);
    const evento = estado.evento;
    if (!evento) {
      if (!estado.error && this.respuesta) this.respuesta.status = 404;
      this.titulo.setTitle('Evento sin página pública · Pasitos');
      return;
    }
    const descripcion = [
      evento.fecha
        ? formatFecha(evento.fecha.inicioAt, evento.fecha.finAt, evento.zonaHoraria)
        : null,
      evento.lugar?.nombre ?? null,
    ]
      .filter(Boolean)
      .join(' · ');
    this.titulo.setTitle(`${evento.nombre} · Pasitos`);
    this.meta.updateTag({ property: 'og:title', content: evento.nombre });
    this.meta.updateTag({
      property: 'og:description',
      content: descripcion || `Organiza ${evento.organizacion}`,
    });
    if (evento.portada) this.meta.updateTag({ property: 'og:image', content: evento.portada });
    // *Solo con enlace* no se indexa (HU-406 §6).
    if (evento.visibilidad === 'solo_enlace') {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    } else if (evento.fecha && !this.documento.getElementById('datos-evento')) {
      // schema.org/Event, para los buscadores.
      const script = this.documento.createElement('script');
      script.id = 'datos-evento';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: evento.nombre,
        startDate: evento.fecha.inicioAt,
        endDate: evento.fecha.finAt,
        organizer: { '@type': 'Organization', name: evento.organizacion },
        ...(evento.lugar?.nombre
          ? {
              location: {
                '@type': 'Place',
                name: evento.lugar.nombre,
                ...(evento.lugar.direccion ? { address: evento.lugar.direccion } : {}),
              },
            }
          : {}),
      }).replace(/</g, '\\u003c');
      this.documento.head.appendChild(script);
    }
  }
}
