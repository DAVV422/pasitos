import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { usePermisosConsola } from './consola.layout';
import { PlataformaApi, type OrganizacionDetalle } from './plataforma-api.service';

type Accion = 'dueno' | 'prueba' | null;

/** Detalle de una organización: dueño, eventos, suspender, cambiar dueño y evento de prueba. */
@Component({
  selector: 'plt-organizacion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    TarjetaComponent,
  ],
  template: `
    <a routerLink="/organizaciones" class="underline">← Organizaciones</a>
    @if (organizacion(); as org) {
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="font-display text-3xl font-extrabold">{{ org.nombre }}</h1>
        <span class="flex gap-2">
          @if (org.esDemo) {
            <px-chip variante="puntos">Demo</px-chip>
          }
          <px-chip [variante]="org.estado === 'activa' ? 'ok' : 'peligro'">
            {{ org.estado === 'activa' ? 'Activa' : 'Suspendida' }}
          </px-chip>
        </span>
      </header>
      <p class="text-muted">{{ org.slug }}</p>

      @if (mensaje(); as aviso) {
        <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
      }

      <px-tarjeta>
        <h2 class="mb-2 text-xl font-bold">Dueño</h2>
        <ul class="flex flex-col gap-1">
          @for (d of org.duenos; track d.id) {
            <li>
              <b>{{ d.nombre ?? d.email }}</b> · {{ d.email }} ·
              {{
                d.estado === 'activo'
                  ? 'Activo'
                  : d.estado === 'invitado'
                    ? 'Invitación pendiente'
                    : 'Ya no es dueño'
              }}
            </li>
          }
        </ul>
        @if (permisos.puedeEscribir()) {
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" pxBoton="secundario" [chico]="true" (click)="accion.set('dueno')">
              Cambiar o reinvitar al dueño
            </button>
            @if (!org.esDemo) {
              <button
                type="button"
                [pxBoton]="org.estado === 'activa' ? 'peligro' : 'secundario'"
                [chico]="true"
                [cargando]="enviando()"
                (click)="toggleEstado(org)"
              >
                {{ org.estado === 'activa' ? 'Suspender' : 'Reactivar' }}
              </button>
            }
            <button
              type="button"
              pxBoton="secundario"
              [chico]="true"
              (click)="accion.set('prueba')"
            >
              Crear evento de prueba
            </button>
          </div>
        }
      </px-tarjeta>

      @if (accion() === 'dueno') {
        <px-tarjeta>
          <h2 class="mb-1 text-xl font-bold">Invitar a un dueño</h2>
          <p class="text-muted mb-3 text-sm">
            El dueño actual sigue siéndolo hasta que el nuevo acepta.
          </p>
          <form class="flex flex-col gap-3" (submit)="submitDueno($event)" novalidate>
            <px-campo etiqueta="Nombre" #d1="pxCampo">
              <input
                [id]="d1.idControl"
                [attr.aria-describedby]="d1.idDescripcion"
                [value]="duenoNombre()"
                (input)="duenoNombre.set(valorDe($event))"
              />
            </px-campo>
            <px-campo etiqueta="Correo" #d2="pxCampo">
              <input
                [id]="d2.idControl"
                [attr.aria-describedby]="d2.idDescripcion"
                type="email"
                [value]="duenoEmail()"
                (input)="duenoEmail.set(valorDe($event))"
              />
            </px-campo>
            <px-campo etiqueta="Motivo" ayuda="Queda en la bitácora." #d3="pxCampo">
              <input
                [id]="d3.idControl"
                [attr.aria-describedby]="d3.idDescripcion"
                [value]="motivo()"
                (input)="motivo.set(valorDe($event))"
              />
            </px-campo>
            <div class="flex gap-2">
              <button type="submit" pxBoton [cargando]="enviando()">Enviar la invitación</button>
              <button type="button" pxBoton="secundario" (click)="accion.set(null)">
                Cancelar
              </button>
            </div>
          </form>
        </px-tarjeta>
      }

      @if (accion() === 'prueba') {
        <px-tarjeta>
          <h2 class="mb-3 text-xl font-bold">Evento de prueba</h2>
          <form class="flex flex-col gap-3" (submit)="submitPrueba($event)" novalidate>
            <px-campo etiqueta="Nombre" #p1="pxCampo">
              <input
                [id]="p1.idControl"
                [attr.aria-describedby]="p1.idDescripcion"
                [value]="pruebaNombre()"
                (input)="pruebaNombre.set(valorDe($event))"
              />
            </px-campo>
            <px-campo etiqueta="Inicio" #p2="pxCampo">
              <input
                [id]="p2.idControl"
                [attr.aria-describedby]="p2.idDescripcion"
                type="datetime-local"
                [value]="pruebaInicio()"
                (input)="pruebaInicio.set(valorDe($event))"
              />
            </px-campo>
            <px-campo etiqueta="Fin" #p3="pxCampo">
              <input
                [id]="p3.idControl"
                [attr.aria-describedby]="p3.idDescripcion"
                type="datetime-local"
                [value]="pruebaFin()"
                (input)="pruebaFin.set(valorDe($event))"
              />
            </px-campo>
            <div class="flex gap-2">
              <button type="submit" pxBoton [cargando]="enviando()">Crear</button>
              <button type="button" pxBoton="secundario" (click)="accion.set(null)">
                Cancelar
              </button>
            </div>
          </form>
        </px-tarjeta>
      }

      <px-tarjeta>
        <h2 class="mb-2 text-xl font-bold">Eventos</h2>
        @for (e of org.eventos; track e.id) {
          <p>
            <b>{{ e.nombre }}</b> · {{ e.tipo }} · {{ e.estado }} ·
            {{ e.inicioAt | date: 'dd/MM/yyyy' }}
          </p>
        } @empty {
          <p class="text-muted">Todavía no tiene eventos.</p>
        }
      </px-tarjeta>
    } @else if (error()) {
      <px-estado tipo="error" titulo="No pudimos cargar la organización" [traceId]="traceId()" />
    } @else {
      <px-estado tipo="cargando" />
    }
  `,
})
export class OrganizacionPage implements OnInit {
  private readonly api = inject(PlataformaApi);
  protected readonly permisos = usePermisosConsola();

  readonly id = input.required<string>();

  protected readonly organizacion = signal<OrganizacionDetalle | null>(null);
  protected readonly error = signal(false);
  protected readonly traceId = signal<string | null>(null);
  protected readonly accion = signal<Accion>(null);
  protected readonly enviando = signal(false);
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly duenoNombre = signal('');
  protected readonly duenoEmail = signal('');
  protected readonly motivo = signal('');
  protected readonly pruebaNombre = signal('');
  protected readonly pruebaInicio = signal('');
  protected readonly pruebaFin = signal('');
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected async toggleEstado(org: OrganizacionDetalle): Promise<void> {
    const estado = org.estado === 'activa' ? 'suspendida' : 'activa';
    await this.run(
      () => this.api.updateOrganizacion(org.id, { estado }),
      estado === 'suspendida'
        ? 'Suspendida: no puede crear ni publicar eventos. Un evento en curso sigue.'
        : 'Reactivada.',
    );
  }

  protected async submitDueno(evento: Event): Promise<void> {
    evento.preventDefault();
    await this.run(
      () =>
        this.api.inviteDueno(this.id(), {
          email: this.duenoEmail().trim(),
          nombre: this.duenoNombre().trim(),
          motivo: this.motivo().trim(),
        }),
      `Enviamos la invitación a ${this.duenoEmail().trim()}.`,
    );
  }

  protected async submitPrueba(evento: Event): Promise<void> {
    evento.preventDefault();
    const toIso = (local: string) => (local ? new Date(local).toISOString() : '');
    await this.run(
      () =>
        this.api
          .createEventoPrueba(this.id(), {
            nombre: this.pruebaNombre().trim(),
            inicioAt: toIso(this.pruebaInicio()),
            finAt: toIso(this.pruebaFin()),
          })
          .then(() => undefined),
      'Creamos el evento de prueba.',
    );
  }

  private async run(paso: () => Promise<void>, exito: string): Promise<void> {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      await paso();
      this.mensaje.set({ variante: 'ok', texto: exito });
      this.accion.set(null);
      await this.load();
    } catch (error) {
      const campo = error instanceof ErrorApi ? error.errors[0]?.message : undefined;
      this.mensaje.set({ variante: 'peligro', texto: campo ?? getMensajeError(error) });
    } finally {
      this.enviando.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      this.organizacion.set(await this.api.getOrganizacion(this.id()));
      this.error.set(false);
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.error.set(true);
    }
  }
}
