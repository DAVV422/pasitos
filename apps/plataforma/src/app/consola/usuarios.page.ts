import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { NOMBRES_ROL_PLATAFORMA } from '@pasitos/dominio/esquemas';
import { getMensajeError, valorDe } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { usePermisosConsola } from './consola.layout';
import { PlataformaApi, type PersonaFila } from './plataforma-api.service';

/**
 * Personas de Pasitos (solo el administrador principal nombra y cambia) y ayuda a cualquier persona:
 * buscar por correo y restablecer su segundo factor (HU-202 §4 y §5).
 */
@Component({
  selector: 'plt-usuarios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, CampoComponent, EstadoComponent, TarjetaComponent],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Personas</h1>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    @if (permisos.esPrincipal()) {
      <px-tarjeta>
        <h2 class="mb-3 text-xl font-bold">Invitar a la consola</h2>
        <form class="flex flex-col gap-3" (submit)="submitInvitar($event)" novalidate>
          <px-campo etiqueta="Nombre" #i1="pxCampo">
            <input
              [id]="i1.idControl"
              [attr.aria-describedby]="i1.idDescripcion"
              [value]="nombre()"
              (input)="nombre.set(valorDe($event))"
            />
          </px-campo>
          <px-campo etiqueta="Correo" #i2="pxCampo">
            <input
              [id]="i2.idControl"
              [attr.aria-describedby]="i2.idDescripcion"
              type="email"
              [value]="email()"
              (input)="email.set(valorDe($event))"
            />
          </px-campo>
          <px-campo etiqueta="Rol" #i3="pxCampo">
            <select
              [id]="i3.idControl"
              [attr.aria-describedby]="i3.idDescripcion"
              (change)="rol.set(valorDe($event) === 'soporte' ? 'soporte' : 'admin')"
            >
              <option value="admin">Administrador: puede hacer todo menos nombrar personas</option>
              <option value="soporte">Soporte: solo lectura</option>
            </select>
          </px-campo>
          <button type="submit" pxBoton [cargando]="enviando()">Enviar la invitación</button>
        </form>
      </px-tarjeta>
    }

    <px-tarjeta>
      <h2 class="mb-2 text-xl font-bold">Equipo de Pasitos</h2>
      @switch (estado()) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('error') {
          <px-estado tipo="error" titulo="No pudimos cargar las personas" />
        }
        @default {
          <ul class="flex flex-col gap-3">
            @for (p of personas(); track p.id) {
              <li class="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b>{{ p.nombre }}</b> · {{ nombreRol(p.rolPlataforma) }}
                  <span class="text-muted block text-sm">
                    {{ p.email }} · {{ p.aceptado ? 'Activa' : 'Invitación pendiente' }}
                    {{ p.segundoFactor ? '· con segundo factor' : '' }}
                  </span>
                </span>
                @if (permisos.esPrincipal() && p.rolPlataforma !== 'superadmin') {
                  <span class="flex gap-2">
                    <button
                      type="button"
                      pxBoton="secundario"
                      [chico]="true"
                      (click)="updateRol(p, p.rolPlataforma === 'admin' ? 'soporte' : 'admin')"
                    >
                      Pasar a {{ p.rolPlataforma === 'admin' ? 'soporte' : 'administrador' }}
                    </button>
                    <button
                      type="button"
                      pxBoton="peligro-contorno"
                      [chico]="true"
                      (click)="updateRol(p, null)"
                    >
                      Quitar el acceso
                    </button>
                  </span>
                }
              </li>
            }
          </ul>
        }
      }
    </px-tarjeta>

    <px-tarjeta>
      <h2 class="mb-1 text-xl font-bold">Ayudar a una persona</h2>
      <p class="text-muted mb-3 text-sm">
        Busca por el correo exacto. Para restablecer su segundo factor, primero verifica que es
        ella.
      </p>
      <form class="flex gap-2" (submit)="submitBuscar($event)" novalidate>
        <input
          class="flex-1"
          type="email"
          aria-label="Correo exacto"
          [value]="buscado()"
          (input)="buscado.set(valorDe($event))"
        />
        <button type="submit" pxBoton="secundario">Buscar</button>
      </form>
      @if (encontrada(); as p) {
        <div class="mt-3 flex flex-col gap-3">
          <p>
            <b>{{ p.nombre }}</b> · {{ p.email }} ·
            {{ p.segundoFactor ? 'tiene segundo factor' : 'sin segundo factor' }}
          </p>
          @if (permisos.puedeEscribir()) {
            <px-campo etiqueta="Motivo" #r1="pxCampo">
              <input
                [id]="r1.idControl"
                [attr.aria-describedby]="r1.idDescripcion"
                [value]="motivo()"
                (input)="motivo.set(valorDe($event))"
              />
            </px-campo>
            <px-campo
              etiqueta="Cómo verificaste que es ella"
              ayuda='Por ejemplo: "Videollamada con su CI, 21/11 15:00". Queda en la bitácora.'
              #r2="pxCampo"
            >
              <input
                [id]="r2.idControl"
                [attr.aria-describedby]="r2.idDescripcion"
                [value]="verificacion()"
                (input)="verificacion.set(valorDe($event))"
              />
            </px-campo>
            <button
              type="button"
              pxBoton="peligro"
              [cargando]="enviando()"
              (click)="resetSegundoFactor(p)"
            >
              Restablecer su segundo factor
            </button>
          }
        </div>
      } @else if (sinResultado()) {
        <p class="text-muted mt-3">No hay nadie con ese correo.</p>
      }
    </px-tarjeta>
  `,
})
export class UsuariosPage implements OnInit {
  private readonly api = inject(PlataformaApi);
  protected readonly permisos = usePermisosConsola();

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly personas = signal<readonly PersonaFila[]>([]);
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly enviando = signal(false);
  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly rol = signal<'admin' | 'soporte'>('admin');
  protected readonly buscado = signal('');
  protected readonly encontrada = signal<PersonaFila | null>(null);
  protected readonly sinResultado = signal(false);
  protected readonly motivo = signal('');
  protected readonly verificacion = signal('');
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected nombreRol(rol: PersonaFila['rolPlataforma']): string {
    return rol ? NOMBRES_ROL_PLATAFORMA[rol] : 'Sin rol';
  }

  protected async submitInvitar(evento: Event): Promise<void> {
    evento.preventDefault();
    await this.run(
      () =>
        this.api
          .invitePersona({
            email: this.email().trim(),
            nombre: this.nombre().trim(),
            rol: this.rol(),
          })
          .then(() => undefined),
      `Enviamos la invitación a ${this.email().trim()}.`,
    );
  }

  protected async updateRol(persona: PersonaFila, rol: 'admin' | 'soporte' | null): Promise<void> {
    const texto = rol
      ? `¿Pasar a ${persona.nombre} a ${this.nombreRol(rol).toLowerCase()}?`
      : `¿Quitarle a ${persona.nombre} el acceso a la consola? Se cierran sus sesiones.`;
    const motivo = window.prompt(`${texto}\n\nEscribe el motivo (queda en la bitácora):`);
    if (!motivo) {
      return;
    }
    await this.run(() => this.api.updateRol(persona.id, rol, motivo), 'Listo.');
  }

  protected async submitBuscar(evento: Event): Promise<void> {
    evento.preventDefault();
    this.encontrada.set(null);
    this.sinResultado.set(false);
    try {
      const [persona] = (await this.api.listPersonas(this.buscado().trim().toLowerCase())).items;
      this.encontrada.set(persona ?? null);
      this.sinResultado.set(!persona);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
  }

  protected async resetSegundoFactor(persona: PersonaFila): Promise<void> {
    await this.run(
      () =>
        this.api.resetSegundoFactor(persona.id, this.motivo().trim(), this.verificacion().trim()),
      `Restablecimos el segundo factor de ${persona.nombre}: cerramos sus sesiones y le avisamos por correo.`,
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
      this.personas.set((await this.api.listPersonas()).items);
      this.estado.set('listo');
    } catch {
      this.estado.set('error');
    }
  }
}
