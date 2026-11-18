import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EstadoComponent, IconoComponent } from '@pasitos/ui';
import { formatDiaYHora, formatHora } from '../formato';
import { SesionAsistente } from '../sesion-asistente';

/**
 * *Información* (HU-309 §2): cuándo y dónde, el wifi, el contacto, las preguntas frecuentes y
 * *Cómo funcionan los puntos*. El wifi solo llega a la app del asistente.
 */
@Component({
  selector: 'app-info-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent, IconoComponent],
  template: `
    @if (sesion.errorEvento()) {
      <h1 class="text-2xl font-extrabold">Información</h1>
      <px-estado tipo="error" titulo="No pudimos cargar la información. Revisa tu conexión." />
    } @else if (sesion.evento(); as evento) {
      @if (evento.info.portadaUrl; as portada) {
        <img
          [src]="portada"
          alt=""
          loading="lazy"
          class="border-line aspect-video w-full rounded-xl border object-cover"
        />
      }
      <h1 class="text-2xl font-extrabold">{{ evento.nombre }}</h1>
      @if (evento.info; as info) {
        <section class="flex flex-col gap-3">
          <p class="flex items-start gap-3">
            <px-icono nombre="cal" [tamano]="20" />
            <span>{{ cuando() }}</span>
          </p>
          @if (info.lugarNombre || info.lugarDireccion) {
            <p class="flex items-start gap-3">
              <px-icono nombre="pin" [tamano]="20" />
              <span>
                @if (info.lugarNombre) {
                  <b>{{ info.lugarNombre }}</b>
                }
                @if (info.lugarDireccion) {
                  <br />{{ info.lugarDireccion }}
                }
              </span>
            </p>
          }
          @if (info.descripcion) {
            <p class="whitespace-pre-line">{{ info.descripcion }}</p>
          }
        </section>

        @if (info.wifi || info.contacto) {
          <section class="border-line bg-surface flex flex-col gap-3 rounded-xl border p-4">
            @if (info.wifi) {
              <div>
                <h2 class="text-muted text-sm font-bold uppercase">Wifi</h2>
                <p class="font-semibold whitespace-pre-line select-all">{{ info.wifi }}</p>
              </div>
            }
            @if (info.contacto) {
              <div>
                <h2 class="text-muted text-sm font-bold uppercase">Contacto</h2>
                <p class="whitespace-pre-line">{{ info.contacto }}</p>
              </div>
            }
          </section>
        }

        <section class="flex flex-col gap-2" aria-labelledby="como-puntos">
          <h2 id="como-puntos" class="text-xl font-bold">
            Cómo funcionan los {{ info.nombrePuntos }}
          </h2>
          <ul class="flex list-disc flex-col gap-1 pl-5">
            <li>
              Ganas {{ info.nombrePuntos }} al completar retos: escanea el QR de una sala o un
              stand, o recíbelos del equipo del evento.
            </li>
            <li>Tu saldo lo confirma el servidor; si no tienes señal, lo ves apenas vuelva.</li>
            <li>Los canjeas por premios en la mesa de canje, desde <b>Canjear</b>.</li>
            <li>Valen solo durante {{ evento.nombre }} y vencen al cierre. No son dinero.</li>
          </ul>
        </section>
      }

      @if (evento.preguntas.length) {
        <section class="flex flex-col gap-2" aria-labelledby="preguntas">
          <h2 id="preguntas" class="text-xl font-bold">Preguntas frecuentes</h2>
          @for (p of evento.preguntas; track $index) {
            <details class="border-line bg-surface rounded-xl border p-4">
              <summary class="min-h-6 cursor-pointer font-semibold">{{ p.pregunta }}</summary>
              <p class="mt-2 whitespace-pre-line">{{ p.respuesta }}</p>
            </details>
          }
        </section>
      }
    } @else {
      <h1 class="text-2xl font-extrabold">Información</h1>
      <px-estado tipo="cargando" titulo="Cargando la información…" />
    }
  `,
})
export class InfoPage {
  protected readonly sesion = inject(SesionAsistente);
  protected readonly cuando = computed(() => {
    const info = this.sesion.evento()?.info;
    if (!info) return '';
    const zona = this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz';
    return `Del ${formatDiaYHora(info.inicioAt, zona)} a las ${formatHora(info.finAt, zona)}`;
  });
}
