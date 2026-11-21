import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NOMBRES_ROL } from '@pasitos/dominio';
import { esquemaCrearEvento, NOMBRES_ESTADO_EVENTO } from '@pasitos/dominio/esquemas';
import { getErrorCampo, getMensajeError, LayoutComponent, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  TarjetaComponent,
  FechaHoraDirective,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventosApi, type EventoResumen } from './eventos-api.service';

/** Mis eventos y *Crear evento* para quien es dueña de una organización (HU-205 §6). */
@Component({
  selector: 'adm-mis-eventos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    LayoutComponent,
    AvisoComponent,
    BotonDirective,
    FechaHoraDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    TarjetaComponent,
  ],
  template: `
    <pnl-layout contexto="Panel" [menu]="[{ ruta: '/eventos', texto: 'Mis eventos' }]">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="font-display text-3xl font-extrabold">Mis eventos</h1>
        @if (organizaciones().length > 0 && !creando()) {
          <button type="button" pxBoton (click)="creando.set(true)">Crear evento</button>
        }
      </header>

      @if (creando()) {
        <px-tarjeta>
          <h2 class="mb-3 text-xl font-bold">Nuevo evento</h2>
          <form class="flex flex-col gap-4" (submit)="submit($event)" novalidate>
            @if (organizaciones().length > 1) {
              <px-campo etiqueta="Organización" #co="pxCampo">
                <select
                  [id]="co.idControl"
                  [attr.aria-describedby]="co.idDescripcion"
                  (change)="organizacionId.set(valorDe($event))"
                >
                  @for (org of organizaciones(); track org.id) {
                    <option [value]="org.id">{{ org.nombre }}</option>
                  }
                </select>
              </px-campo>
            }
            <px-campo
              etiqueta="Nombre del evento"
              [error]="errores()['nombre'] ?? null"
              #cn="pxCampo"
            >
              <input
                [id]="cn.idControl"
                [attr.aria-describedby]="cn.idDescripcion"
                maxlength="120"
                [value]="nombre()"
                (input)="nombre.set(valorDe($event))"
              />
            </px-campo>
            <px-campo etiqueta="Empieza" [error]="errores()['inicioAt'] ?? null" #ci="pxCampo">
              <input
                [id]="ci.idControl"
                [attr.aria-describedby]="ci.idDescripcion"
                [pxFechaHora]="inicio()"
                (fechaHora)="inicio.set($event)"
              />
            </px-campo>
            <px-campo
              etiqueta="Termina"
              ayuda="Hasta 7 días después del inicio."
              [error]="errores()['finAt'] ?? null"
              #cf="pxCampo"
            >
              <input
                [id]="cf.idControl"
                [attr.aria-describedby]="cf.idDescripcion"
                [pxFechaHora]="fin()"
                (fechaHora)="fin.set($event)"
              />
            </px-campo>
            <p class="text-muted text-sm">
              Hora de Bolivia. Queda en borrador y privado: nadie lo ve hasta que lo publiques.
            </p>
            @if (errorCrear(); as mensaje) {
              <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
            }
            <div class="flex gap-3">
              <button type="submit" pxBoton [cargando]="enviando()" [deshabilitado]="!valido()">
                {{ enviando() ? 'Creando…' : 'Crear el evento' }}
              </button>
              <button type="button" pxBoton="secundario" (click)="creando.set(false)">
                Cancelar
              </button>
            </div>
          </form>
        </px-tarjeta>
      }

      @switch (estado()) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('error') {
          <px-estado tipo="error" titulo="No pudimos cargar tus eventos" [traceId]="traceId()">
            <button type="button" pxBoton="secundario" (click)="load()">Reintentar</button>
          </px-estado>
        }
        @default {
          @for (evento of eventos(); track evento.id) {
            <a [routerLink]="['/eventos', evento.id]" class="group block">
              <px-tarjeta class="group-hover:border-line-strong transition-colors">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <b>{{ evento.nombre }}</b>
                  <span class="flex gap-2">
                    @if (evento.tipo !== 'real') {
                      <px-chip variante="puntos">{{
                        evento.tipo === 'demo' ? 'Demo' : 'Prueba'
                      }}</px-chip>
                    }
                    <px-chip [variante]="evento.estado === 'en_curso' ? 'ok' : 'atenuado'">{{
                      nombreEstado(evento.estado)
                    }}</px-chip>
                  </span>
                </div>
                <p class="text-muted text-sm">
                  {{ evento.inicioAt | date: 'dd/MM/yyyy HH:mm' }} ·
                  {{ evento.organizacion.nombre }} ·
                  {{ nombreRol(evento.miRol) }}
                </p>
              </px-tarjeta>
            </a>
          } @empty {
            <px-estado tipo="vacio" titulo="Todavía no tienes eventos">
              @if (organizaciones().length > 0) {
                Crea el primero con «Crear evento».
              } @else {
                Cuando alguien te invite al equipo de un evento, aparece aquí.
              }
            </px-estado>
          }
        }
      }
    </pnl-layout>
  `,
})
export class MisEventosPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly router = inject(Router);

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly eventos = signal<readonly EventoResumen[]>([]);
  protected readonly organizaciones = signal<readonly { id: string; nombre: string }[]>([]);

  protected readonly creando = signal(false);
  protected readonly organizacionId = signal('');
  protected readonly nombre = signal('');
  protected readonly inicio = signal('');
  protected readonly fin = signal('');
  protected readonly enviando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly errorCrear = signal<string | null>(null);
  protected readonly valido = computed(
    () => esquemaCrearEvento.safeParse(this.buildDatos()).success,
  );
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected nombreRol(rol: EventoResumen['miRol']): string {
    return NOMBRES_ROL[rol];
  }

  protected nombreEstado(estado: string): string {
    return NOMBRES_ESTADO_EVENTO[estado as keyof typeof NOMBRES_ESTADO_EVENTO] ?? estado;
  }

  protected async load(): Promise<void> {
    this.estado.set('cargando');
    try {
      const [eventos, organizaciones] = await Promise.all([
        this.api.listEventos(),
        this.api.listOrganizaciones(),
      ]);
      this.eventos.set(eventos);
      const activas = organizaciones.filter((o) => o.estado === 'activa');
      this.organizaciones.set(activas);
      this.organizacionId.set(activas[0]?.id ?? '');
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.valido() || this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.errorCrear.set(null);
    this.errores.set({});
    try {
      const creado = await this.api.createEvento(this.organizacionId(), {
        ...this.buildDatos(),
        zonaHoraria: 'America/La_Paz',
      });
      await this.router.navigate(['/eventos', creado.id]);
    } catch (error) {
      const campos = ['nombre', 'inicioAt', 'finAt'];
      this.errores.set(Object.fromEntries(campos.map((c) => [c, getErrorCampo(error, c)])));
      if (campos.every((c) => !getErrorCampo(error, c))) {
        this.errorCrear.set(getMensajeError(error));
      }
    } finally {
      this.enviando.set(false);
    }
  }

  /** `datetime-local` en hora de Bolivia (UTC−4) a ISO. */
  private buildDatos() {
    const toIso = (local: string) => (local ? `${local}:00-04:00` : '');
    return {
      nombre: this.nombre().trim(),
      inicioAt: toIso(this.inicio()),
      finAt: toIso(this.fin()),
    };
  }
}
