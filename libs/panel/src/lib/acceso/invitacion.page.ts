import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { esquemaPasswordNueva, NOMBRES_ROL_PLATAFORMA } from '@pasitos/dominio/esquemas';
import { isRolEvento, NOMBRES_ROL } from '@pasitos/dominio';
import { AvisoComponent, BotonDirective, CampoComponent, EstadoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AuthApi, type InvitacionVista } from '../sesion/auth-api.service';
import { SesionService } from '../sesion/sesion.service';
import { getErrorCampo, getMensajeError, MarcoAccesoComponent, valorDe } from './comun';
import { PasswordNuevaComponent } from './password-nueva.component';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; titulo: string; texto: string; traceId: string | null }
  | { tipo: 'listo'; invitacion: InvitacionVista };

/** Aceptar una invitación por enlace: equipo, organización o consola (HU-202 §2, HU-203 §3). */
@Component({
  selector: 'pnl-invitacion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MarcoAccesoComponent,
    CampoComponent,
    PasswordNuevaComponent,
    BotonDirective,
    AvisoComponent,
    EstadoComponent,
    RouterLink,
    DatePipe,
  ],
  template: `
    <pnl-marco-acceso [titulo]="titulo()" [bajada]="bajada()">
      @switch (estado().tipo) {
        @case ('cargando') {
          <px-estado tipo="cargando" />
        }
        @case ('error') {
          @if (estado(); as e) {
            @if (e.tipo === 'error') {
              <px-estado tipo="error" [titulo]="e.titulo" [traceId]="e.traceId">{{
                e.texto
              }}</px-estado>
              <a pxBoton="secundario" routerLink="/entrar">Ir a entrar</a>
            }
          }
        }
        @case ('listo') {
          @if (invitacion(); as inv) {
            @if (inv.evento; as evento) {
              <p class="text-muted">
                {{ evento.inicioAt | date: 'dd/MM/yyyy' }} · Para <b>{{ inv.email }}</b>
              </p>
            } @else {
              <p class="text-muted">
                Para <b>{{ inv.email }}</b>
              </p>
            }

            @if (inv.tieneCuenta) {
              @if (sesionDeOtro()) {
                <px-aviso variante="advertencia">
                  Entraste como {{ sesion.usuario()?.email }}. Esta invitación es para otra cuenta.
                </px-aviso>
                <button type="button" pxBoton="secundario" (click)="logoutYEntrar()">
                  Salir y entrar con {{ inv.email }}
                </button>
              } @else if (sesion.usuario()) {
                <button type="button" pxBoton [cargando]="enviando()" (click)="accept()">
                  {{ enviando() ? 'Aceptando…' : 'Aceptar la invitación' }}
                </button>
              } @else {
                <p>Ya tienes una cuenta en Pasitos con este correo.</p>
                <a pxBoton routerLink="/entrar" [queryParams]="{ volver: volverAqui() }">
                  Entrar para aceptar
                </a>
              }
            } @else {
              <form class="flex flex-col gap-4" (submit)="submit($event)" novalidate>
                <px-campo etiqueta="Tu nombre" [error]="errorNombre()" #campoNombre="pxCampo">
                  <input
                    [id]="campoNombre.idControl"
                    [attr.aria-describedby]="campoNombre.idDescripcion"
                    name="nombre"
                    autocomplete="name"
                    maxlength="80"
                    [value]="nombre()"
                    (input)="nombre.set(valorDe($event))"
                  />
                </px-campo>
                <pnl-password-nueva
                  etiqueta="Elige tu contraseña"
                  [(valor)]="password"
                  [error]="errorPassword()"
                />
                <label class="flex items-start gap-2">
                  <input
                    type="checkbox"
                    class="mt-1"
                    [checked]="acepta()"
                    (change)="acepta.set(!acepta())"
                  />
                  <span
                    >Acepto los términos del piloto de Pasitos y el uso de mis datos para organizar
                    el evento.</span
                  >
                </label>
                <button
                  type="submit"
                  pxBoton
                  [cargando]="enviando()"
                  [deshabilitado]="!puedeCrear()"
                >
                  {{ enviando() ? 'Creando tu cuenta…' : 'Crear mi cuenta y aceptar' }}
                </button>
              </form>
            }
            @if (error(); as mensaje) {
              <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
            }
          }
        }
      }
    </pnl-marco-acceso>
  `,
})
export class InvitacionPage implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);

  readonly token = input.required<string>();

  protected readonly estado = signal<Estado>({ tipo: 'cargando' });
  protected readonly invitacion = computed(() => {
    const estado = this.estado();
    return estado.tipo === 'listo' ? estado.invitacion : null;
  });
  protected readonly titulo = computed(() => {
    const inv = this.invitacion();
    if (!inv) {
      return 'Invitación';
    }
    const quien = inv.quienInvita ?? 'Pasitos';
    return inv.tipo === 'plataforma'
      ? 'Te sumamos a la consola de Pasitos'
      : `${quien} te invitó como ${getNombreRol(inv.rol).toLowerCase()}`;
  });
  protected readonly bajada = computed(() => {
    const inv = this.invitacion();
    return inv?.evento?.nombre ?? inv?.organizacion ?? null;
  });
  protected readonly sesionDeOtro = computed(() => {
    const usuario = this.sesion.usuario();
    const inv = this.invitacion();
    return usuario !== null && inv !== null && usuario.email !== inv.email;
  });
  protected readonly nombre = signal('');
  protected readonly password = signal('');
  protected readonly acepta = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorNombre = signal<string | null>(null);
  protected readonly errorPassword = signal<string | null>(null);
  protected readonly puedeCrear = computed(
    () =>
      this.nombre().trim().length >= 2 &&
      esquemaPasswordNueva.safeParse(this.password()).success &&
      this.acepta(),
  );
  protected readonly valorDe = valorDe;

  async ngOnInit(): Promise<void> {
    try {
      const [invitacion] = await Promise.all([
        this.api.getInvitacion(this.token()),
        this.sesion.ensure(),
      ]);
      this.estado.set({ tipo: 'listo', invitacion });
    } catch (error) {
      const usado = error instanceof ErrorApi && error.code === 'ENLACE_YA_USADO';
      this.estado.set({
        tipo: 'error',
        titulo: usado ? 'Esta invitación ya se aceptó' : 'Esta invitación ya no sirve',
        texto: usado
          ? 'Si eras tú, entra con tu cuenta.'
          : 'Vence a los 7 días o la reemplazaron por otra. Pide que te la envíen de nuevo.',
        traceId: error instanceof ErrorApi ? error.traceId : null,
      });
    }
  }

  protected volverAqui(): string {
    return `/invitacion/${this.token()}`;
  }

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeCrear()) {
      return;
    }
    await this.run({
      nombre: this.nombre().trim(),
      password: this.password(),
      aceptaTerminos: true,
    });
  }

  protected async accept(): Promise<void> {
    await this.run({});
  }

  protected async logoutYEntrar(): Promise<void> {
    await this.sesion.logout();
    await this.router.navigate(['/entrar'], { queryParams: { volver: this.volverAqui() } });
  }

  private async run(datos: { nombre?: string; password?: string; aceptaTerminos?: true }) {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.errorNombre.set(null);
    this.errorPassword.set(null);
    try {
      await this.api.acceptInvitacion(this.token(), datos);
      // La sesión (nueva o la que tenía) decide adónde sigue: el segundo factor si hace falta.
      await this.sesion.reload();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.errorNombre.set(getErrorCampo(error, 'nombre'));
      this.errorPassword.set(
        getErrorCampo(error, 'password') ??
          (error instanceof ErrorApi && error.code === 'PASSWORD_INSEGURA' ? error.detail : null),
      );
      if (!this.errorNombre() && !this.errorPassword()) {
        this.error.set(getMensajeError(error));
      }
    } finally {
      this.enviando.set(false);
    }
  }
}

function getNombreRol(rol: string): string {
  if (isRolEvento(rol)) {
    return NOMBRES_ROL[rol];
  }
  return rol in NOMBRES_ROL_PLATAFORMA
    ? NOMBRES_ROL_PLATAFORMA[rol as keyof typeof NOMBRES_ROL_PLATAFORMA]
    : rol;
}
