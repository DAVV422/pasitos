import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { NOMBRES_ROL_PLATAFORMA } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getMensajeError,
  MenuAccionesComponent,
  PanelLateralComponent,
  valorDe,
} from '@pasitos/panel';
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
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    EstadoComponent,
    TarjetaComponent,
    EncabezadoPaginaComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Personas"
      descripcion="Quién entra a la consola de Pasitos, y ayuda a cualquier persona con su acceso."
    >
      @if (permisos.esPrincipal()) {
        <button type="button" pxBoton (click)="invitando.set(true)">Invitar a la consola</button>
      }
    </pnl-encabezado-pagina>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    <pnl-panel-lateral
      titulo="Invitar a la consola"
      [abierto]="invitando()"
      [guardando]="enviando()"
      textoGuardar="Enviar la invitación"
      (guardar)="submitInvitar($event)"
      (cerrado)="invitando.set(false)"
    >
      @if (invitando()) {
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
        <px-campo
          etiqueta="Rol"
          [ayuda]="
            rol() === 'soporte' ? 'Solo lectura.' : 'Puede hacer todo menos nombrar personas.'
          "
          #i3="pxCampo"
        >
          <select
            [id]="i3.idControl"
            [attr.aria-describedby]="i3.idDescripcion"
            (change)="rol.set(valorDe($event) === 'soporte' ? 'soporte' : 'admin')"
          >
            <option value="admin" [selected]="rol() === 'admin'">Administrador</option>
            <option value="soporte" [selected]="rol() === 'soporte'">Soporte</option>
          </select>
        </px-campo>
        @if (mensajePanel(); as texto) {
          <px-aviso variante="peligro">{{ texto }}</px-aviso>
        }
      }
    </pnl-panel-lateral>

    <section class="flex flex-col gap-3" aria-labelledby="equipo-pasitos">
      <h2 id="equipo-pasitos" class="text-xl font-bold">Equipo de Pasitos</h2>
      @switch (estado()) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('error') {
          <px-estado tipo="error" titulo="No pudimos cargar las personas" />
        }
        @default {
          <table class="pnl-tabla">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="px-sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (p of personas(); track p.id) {
                <tr>
                  <td>{{ p.nombre }}</td>
                  <td data-etiqueta="Correo" class="break-all">{{ p.email }}</td>
                  <td data-etiqueta="Rol">{{ nombreRol(p.rolPlataforma) }}</td>
                  <td data-etiqueta="Estado">
                    {{ p.aceptado ? 'Activa' : 'Invitación pendiente' }}
                    @if (p.segundoFactor) {
                      <span class="text-muted text-sm">· con segundo factor</span>
                    }
                  </td>
                  <td class="pnl-tabla__acciones">
                    @if (permisos.esPrincipal() && p.rolPlataforma !== 'superadmin') {
                      <pnl-menu-acciones [etiqueta]="'Acciones de ' + p.nombre">
                        <button
                          type="button"
                          (click)="updateRol(p, p.rolPlataforma === 'admin' ? 'soporte' : 'admin')"
                        >
                          Pasar a {{ p.rolPlataforma === 'admin' ? 'soporte' : 'administrador' }}
                        </button>
                        <hr />
                        <button
                          type="button"
                          class="pnl-acciones__peligro"
                          (click)="updateRol(p, null)"
                        >
                          Quitar el acceso
                        </button>
                      </pnl-menu-acciones>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>

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
  private readonly avisos = inject(AvisosService);
  protected readonly permisos = usePermisosConsola();

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly personas = signal<readonly PersonaFila[]>([]);
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly enviando = signal(false);
  protected readonly invitando = signal(false);
  /** El error de la invitación se muestra dentro del panel (el resto de la página queda atrás). */
  protected readonly mensajePanel = signal<string | null>(null);
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
    this.mensajePanel.set(null);
    const ok = await this.run(
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
    if (ok) {
      this.invitando.set(false);
      this.nombre.set('');
      this.email.set('');
    } else {
      this.mensajePanel.set(this.mensaje()?.texto ?? null);
      this.mensaje.set(null);
    }
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

  private async run(paso: () => Promise<void>, exito: string): Promise<boolean> {
    if (this.enviando()) {
      return false;
    }
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      await paso();
      this.avisos.ok(exito);
      await this.load();
      return true;
    } catch (error) {
      const campo = error instanceof ErrorApi ? error.errors[0]?.message : undefined;
      this.mensaje.set({ variante: 'peligro', texto: campo ?? getMensajeError(error) });
      return false;
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
