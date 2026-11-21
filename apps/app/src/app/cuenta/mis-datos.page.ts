import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  IconoComponent,
} from '@pasitos/ui';
import { formatCelular, normalizeCelular } from '@pasitos/dominio';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type MisDatos } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';

/**
 * *Mis datos* (HU-320 §4): el nombre, el correo y el carnet. Un carnet verificado (HU-321) ya no
 * se edita. Los cambios van firmados con la llave del celular.
 */
@Component({
  selector: 'app-mis-datos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    EstadoComponent,
    IconoComponent,
    RouterLink,
  ],
  template: `
    <a
      routerLink="/cuenta"
      class="text-muted inline-flex min-h-11 items-center gap-1 font-semibold"
    >
      <px-icono nombre="back" [tamano]="18" />Mi cuenta
    </a>
    <h1 class="text-2xl font-extrabold">Mis datos</h1>
    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" titulo="Cargando tus datos…" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar tus datos. Revisa tu conexión." />
      }
      @default {
        <form class="flex flex-col gap-4" (submit)="save($event)" novalidate>
          <px-campo etiqueta="Nombre" [error]="errores()['nombre'] ?? null" #c1="pxCampo">
            <input
              [id]="c1.idControl"
              [attr.aria-describedby]="c1.idDescripcion"
              autocomplete="name"
              maxlength="80"
              [value]="nombre()"
              (input)="nombre.set($any($event.target).value)"
            />
          </px-campo>
          <px-campo
            etiqueta="Correo"
            [opcional]="true"
            [error]="errores()['email'] ?? null"
            #c2="pxCampo"
          >
            <input
              [id]="c2.idControl"
              [attr.aria-describedby]="c2.idDescripcion"
              type="email"
              autocomplete="email"
              maxlength="254"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
          </px-campo>
          @if (datos()?.ciVerificado) {
            <div class="border-line bg-surface rounded-xl border p-4">
              <p class="text-muted text-sm">Carnet de identidad</p>
              <p class="flex items-center gap-2 font-bold">
                {{ datos()?.ci }}
                <span class="text-success inline-flex items-center gap-1">
                  <px-icono nombre="check" [tamano]="16" />Verificado
                </span>
              </p>
            </div>
          } @else {
            <px-campo
              etiqueta="Carnet de identidad"
              [opcional]="true"
              ayuda="Si lo verificas con el equipo del evento, ganas puntos."
              [error]="errores()['ci'] ?? null"
              #c3="pxCampo"
            >
              <input
                [id]="c3.idControl"
                [attr.aria-describedby]="c3.idDescripcion"
                maxlength="20"
                [value]="ci()"
                (input)="ci.set($any($event.target).value)"
              />
            </px-campo>
          }
          @if (datos()?.pideCelular !== 'no' || datos()?.celular) {
            <!-- HU-411. -->
            <px-campo
              etiqueta="Celular"
              [opcional]="datos()?.pideCelular !== 'obligatorio'"
              ayuda="Para que el organizador te pueda contactar. Ejemplo: 71234567; de otro país, con el código (+54…)."
              [error]="errores()['celular'] ?? null"
              #c9="pxCampo"
            >
              <input
                [id]="c9.idControl"
                [attr.aria-describedby]="c9.idDescripcion"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                maxlength="30"
                data-testid="celular"
                [value]="celular()"
                (input)="celular.set($any($event.target).value)"
              />
            </px-campo>
          }
          @if (mensaje(); as m) {
            <px-aviso [variante]="m.variante" role="status">{{ m.texto }}</px-aviso>
          }
          <button type="submit" pxBoton [bloque]="true" [cargando]="guardando()">Guardar</button>
        </form>
      }
    }
  `,
})
export class MisDatosPage implements OnInit {
  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly datos = signal<MisDatos | null>(null);
  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly ci = signal('');
  protected readonly celular = signal('');
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly guardando = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.fill(await this.api.getMisDatos());
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
    }
  }

  protected async save(evento: Event): Promise<void> {
    evento.preventDefault();
    const actual = this.datos();
    if (!actual || this.guardando()) return;
    const nombre = this.nombre().trim();
    const email = this.email().trim() || null;
    const ci = this.ci().trim() || null;
    // HU-411: se compara ya normalizado; si no se puede, va como está y el servidor dice qué falta.
    const escrito = this.celular().trim();
    const celular = escrito ? (normalizeCelular(escrito) ?? escrito) : null;
    const cambios = {
      ...(nombre !== actual.nombre ? { nombre } : {}),
      ...(email !== actual.email ? { email } : {}),
      ...(!actual.ciVerificado && ci !== actual.ci ? { ci } : {}),
      ...(celular !== actual.celular ? { celular } : {}),
    };
    if (Object.keys(cambios).length === 0) {
      this.mensaje.set({ variante: 'ok', texto: 'No hay cambios.' });
      return;
    }
    this.guardando.set(true);
    this.errores.set({});
    this.mensaje.set(null);
    try {
      this.fill(await this.api.updateMisDatos(cambios));
      this.mensaje.set({ variante: 'ok', texto: 'Guardado.' });
      void this.sesion.refresh();
    } catch (error) {
      if (error instanceof ErrorApi && error.errors.length > 0) {
        this.errores.set(
          Object.fromEntries(error.errors.map((e) => [e.field, e.message] as const)),
        );
      } else {
        this.mensaje.set({
          variante: 'peligro',
          texto: error instanceof ErrorApi ? error.detail : 'No pudimos guardar. Intenta de nuevo.',
        });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  private fill(datos: MisDatos): void {
    this.datos.set(datos);
    this.nombre.set(datos.nombre);
    this.email.set(datos.email ?? '');
    this.ci.set(datos.ci ?? '');
    this.celular.set(formatCelular(datos.celular) ?? '');
  }
}
